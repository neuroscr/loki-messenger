/* global log, textsecure, libloki, Signal, Whisper, Headers, ConversationController */
const EventEmitter = require('events');
const nodeFetch = require('node-fetch');
const { URL, URLSearchParams } = require('url');

// Can't be less than 1200 if we have unauth'd requests
const PUBLICCHAT_MSG_POLL_EVERY = 1.5 * 1000; // 1.5s
const PUBLICCHAT_CHAN_POLL_EVERY = 20 * 1000; // 20s
const PUBLICCHAT_DELETION_POLL_EVERY = 5 * 1000; // 1 second

// singleton to relay events to libtextsecure/message_receiver
class LokiPublicChatAPI extends EventEmitter {
  constructor(ourKey) {
    super();
    this.ourKey = ourKey;
    this.servers = [];
  }

  // server getter/factory
  findOrCreateServer(serverUrl) {
    let thisServer = this.servers.find(
      server => server.baseServerUrl === serverUrl
    );
    if (!thisServer) {
      log.info(`LokiPublicChatAPI creating ${serverUrl}`);
      thisServer = new LokiPublicServerAPI(this, serverUrl);
      this.servers.push(thisServer);
    }
    return thisServer;
  }

  // channel getter/factory
  findOrCreateChannel(serverUrl, channelId, conversationId) {
    const server = this.findOrCreateServer(serverUrl);
    return server.findOrCreateChannel(channelId, conversationId);
  }

  // deallocate resources server uses
  unregisterChannel(serverUrl, channelId) {
    let thisServer;
    let i = 0;
    for (; i < this.servers.length; i += 1) {
      if (this.servers[i].server === serverUrl) {
        thisServer = this.servers[i];
        break;
      }
    }

    if (!thisServer) {
      log.warn(`Tried to unregister from nonexistent server ${serverUrl}`);
      return;
    }
    thisServer.unregisterChannel(channelId);
    this.servers.splice(i, 1);
  }
}

class LokiPublicServerAPI {
  constructor(chatAPI, url) {
    this.chatAPI = chatAPI;
    this.channels = [];
    this.tokenPromise = null;
    this.baseServerUrl = url;
    const ref = this;
    (async function justToEnableAsyncToGetToken() {
      ref.token = await ref.getOrRefreshServerToken();
      log.info(`set token ${ref.token}`);
    })();
  }

  // channel getter/factory
  findOrCreateChannel(channelId, conversationId) {
    let thisChannel = this.channels.find(
      channel => channel.channelId === channelId
    );
    if (!thisChannel) {
      log.info(`LokiPublicChatAPI creating channel ${conversationId}`);
      thisChannel = new LokiPublicChannelAPI(this, channelId, conversationId);
      this.channels.push(thisChannel);
    }
    return thisChannel;
  }

  // deallocate resources channel uses
  unregisterChannel(channelId) {
    let thisChannel;
    let i = 0;
    for (; i < this.channels.length; i += 1) {
      if (this.channels[i].channelId === channelId) {
        thisChannel = this.channels[i];
        break;
      }
    }
    if (!thisChannel) {
      return;
    }
    this.channels.splice(i, 1);
    thisChannel.stopPolling = true;
  }

  // get active token for this server
  async getOrRefreshServerToken(forceRefresh = false) {
    let token;
    if (!forceRefresh) {
      if (this.token) {
        return this.token;
      }
      token = await Signal.Data.getPublicServerTokenByServerUrl(
        this.baseServerUrl
      );
    }
    if (!token) {
      token = await this.refreshServerToken();
      if (token) {
        await Signal.Data.savePublicServerToken({
          serverUrl: this.baseServerUrl,
          token,
        });
      }
    }
    this.token = token;
    return token;
  }

  // get active token from server (but only allow one request at a time)
  async refreshServerToken() {
    // if currently not in progress
    if (this.tokenPromise === null) {
      // set lock
      this.tokenPromise = new Promise(async res => {
        // request the oken
        const token = await this.requestToken();
        if (!token) {
          res(null);
          return;
        }
        // activate the token
        const registered = await this.submitToken(token);
        if (!registered) {
          res(null);
          return;
        }
        // resolve promise to release lock
        res(token);
      });
    }
    // wait until we have it set
    const token = await this.tokenPromise;
    // clear lock
    this.tokenPromise = null;
    return token;
  }

  // request an token from the server
  async requestToken() {
    const url = new URL(`${this.baseServerUrl}/loki/v1/get_challenge`);
    const params = {
      pubKey: this.chatAPI.ourKey,
    };
    url.search = new URLSearchParams(params);

    let res;
    try {
      res = await nodeFetch(url);
    } catch (e) {
      return null;
    }
    if (!res.ok) {
      return null;
    }
    const body = await res.json();
    const token = await libloki.crypto.decryptToken(body);
    return token;
  }

  // activate token
  async submitToken(token) {
    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        pubKey: this.chatAPI.ourKey,
        token,
      }),
    };

    try {
      const res = await nodeFetch(
        `${this.baseServerUrl}/loki/v1/submit_challenge`,
        options
      );
      return res.ok;
    } catch (e) {
      return false;
    }
  }
}

class LokiPublicChannelAPI {
  constructor(serverAPI, channelId, conversationId) {
    // properties
    this.serverAPI = serverAPI;
    this.channelId = channelId;
    this.baseChannelUrl = `channels/${this.channelId}`;
    this.conversation = ConversationController.get(conversationId);
    this.lastGot = null;
    this.stopPolling = false;
    this.modStatus = false;
    this.deleteLastId = 1;
    this.timers = {};
    // end properties

    log.info(`registered LokiPublicChannel ${channelId}`);
    // start polling
    this.pollForMessages();
    this.pollForDeletions();
    this.pollForChannel();
    this.refreshModStatus();
  }

  // make a request to the server
  async serverRequest(endpoint, options = {}) {
    const { params = {}, method, objBody, forceFreshToken = false } = options;
    const url = new URL(`${this.serverAPI.baseServerUrl}/${endpoint}`);
    if (params) {
      url.search = new URLSearchParams(params);
    }
    let result;
    let { token } = this.serverAPI;
    if (!token) {
      token = await this.serverAPI.getOrRefreshServerToken();
      if (!token) {
        log.error('NO TOKEN');
        return {
          err: 'noToken',
        };
      }
    }
    try {
      const fetchOptions = {};
      const headers = {
        Authorization: `Bearer ${this.serverAPI.token}`,
      };
      if (method) {
        fetchOptions.method = method;
      }
      if (objBody) {
        headers['Content-Type'] = 'application/json';
        fetchOptions.body = JSON.stringify(objBody);
      }
      fetchOptions.headers = new Headers(headers);
      result = await nodeFetch(url, fetchOptions || undefined);
    } catch (e) {
      log.info(`e ${e}`);
      return {
        err: e,
      };
    }
    let response = null;
    try {
      response = await result.json();
    } catch (e) {
      log.info(`serverRequest json arpse ${e}`);
      return {
        err: e,
        statusCode: result.status,
      };
    }

    // if it's a response style with a meta
    if (result.status !== 200) {
      if (!forceFreshToken && response.meta.code === 401) {
        // copy options because lint complains if we modify this directly
        const updatedOptions = options;
        // force it this time
        updatedOptions.forceFreshToken = true;
        // retry with updated options
        return this.serverRequest(endpoint, updatedOptions);
      }
      return {
        err: 'statusCode',
        statusCode: result.status,
        response,
      };
    }
    return {
      statusCode: result.status,
      response,
    };
  }

  // get moderator status
  async refreshModStatus() {
    // get moderator status
    const res = await this.serverRequest('loki/v1/user_info');
    // if no problems and we have data
    if (!res.err && res.response && res.response.data) {
      this.modStatus = res.response.data.moderator_status;
    }
    // if problems, we won't drop moderator status

    await this.conversation.setModStatus(this.modStatus);

    // get token info
    const tokenRes = await this.serverRequest('token');
    // if no problems and we have data
    if (
      !tokenRes.err &&
      tokenRes.response &&
      tokenRes.response.data &&
      tokenRes.response.data.user
    ) {
      // get our profile name and write it to the network
      const ourNumber = textsecure.storage.user.getNumber();
      const profileConvo = ConversationController.get(ourNumber);
      const profileName = profileConvo.getProfileName();

      if (tokenRes.response.data.user.name !== profileName) {
        if (profileName) {
          await this.serverRequest('users/me', {
            method: 'PATCH',
            objBody: {
              name: profileName,
            },
          });
          // no big deal if it fails...
          // } else {
          // should we update the local from the server?
          // guessing no because there will be multiple servers
        }
      }
    }
  }

  // delete a message on the server
  async deleteMessage(serverId) {
    const res = await this.serverRequest(
      this.modStatus
        ? `loki/v1/moderation/message/${serverId}`
        : `${this.baseChannelUrl}/messages/${serverId}`,
      { method: 'DELETE' }
    );
    if (!res.err && res.response) {
      log.info(`deleted ${serverId} on ${this.baseChannelUrl}`);
      return true;
    }
    // fire an alert
    log.warn(`failed to delete ${serverId} on ${this.baseChannelUrl}`);
    throw new textsecure.PublicChatError(
      'Failed to delete public chat message'
    );
  }

  // used for sending messages
  getEndpoint() {
    const endpoint = `${this.serverAPI.baseServerUrl}/${
      this.baseChannelUrl
    }/messages`;
    return endpoint;
  }

  // update room details
  async pollForChannel() {
    const res = await this.serverRequest(`${this.baseChannelUrl}`, {
      params: {
        include_annotations: 1,
      },
    });
    if (!res.err && res.response) {
      if (
        res.response.data.annotations &&
        res.response.data.annotations.length
      ) {
        res.response.data.annotations.forEach(note => {
          if (note.type === 'net.patter-app.settings') {
            // note.value.description only needed for directory
            // this.conversation.setGroupNameAndAvatar(note.value.name,
            // note.value.avatar);
            if (note.value && note.value.name) {
              this.conversation.setProfileName(note.value.name);
            }
            if (note.value && note.value.avatar) {
              this.conversation.setProfileAvatar(note.value.avatar);
            }
            // else could set a default in case of server problems...
          }
        });
      }
    }
    // set up next poll
    this.timers.channel = setTimeout(() => {
      this.pollForChannel();
    }, PUBLICCHAT_CHAN_POLL_EVERY);
  }

  // get moderation actions
  async pollForDeletions() {
    // grab the last 200 deletions
    const params = {
      count: 200,
    };

    // start loop
    let more = true;
    while (more) {
      // set params to from where we last checked
      params.since_id = this.deleteLastId;

      // grab the next 200 deletions from where we last checked
      // eslint-disable-next-line no-await-in-loop
      const res = await this.serverRequest(
        `loki/v1/channel/${this.channelId}/deletes`,
        { params }
      );

      // Process results
      res.response.data.reverse().forEach(deleteEntry => {
        // Escalate it up to the subsystem that can check to see if this has
        // been processed
        Whisper.events.trigger('deleteLocalPublicMessage', {
          messageServerId: deleteEntry.message_id,
          conversationId: this.conversationId,
        });
      });

      // if we had a problem break the loop
      if (res.response.data.length < 200) {
        break;
      }

      // update where we last checked
      this.deleteLastId = res.response.meta.max_id;
      ({ more } = res.response);
    }

    // set up next poll
    this.timers.delete = setTimeout(() => {
      this.pollForDeletions();
    }, PUBLICCHAT_DELETION_POLL_EVERY);
  }

  // get channel messages
  async pollForMessages() {
    const params = {
      include_annotations: 1,
      count: -20,
      include_deleted: false,
    };
    if (!this.conversation) {
      log.warn('Trying to poll for non-existing public conversation');
      this.lastGot = 0;
    } else if (!this.lastGot) {
      this.lastGot = this.conversation.getLastRetrievedMessage();
    }
    params.since_id = this.lastGot;
    const res = await this.serverRequest(`${this.baseChannelUrl}/messages`, {
      params,
    });

    if (!res.err && res.response) {
      let receivedAt = new Date().getTime();
      res.response.data.reverse().forEach(adnMessage => {
        let timestamp = new Date(adnMessage.created_at).getTime();
        // pubKey lives in the username field
        let from = adnMessage.user.name;
        if (adnMessage.is_deleted) {
          return;
        }
        if (adnMessage.annotations && adnMessage.annotations.length) {
          const noteValue = adnMessage.annotations[0].value;
          ({ timestamp } = noteValue);

          // if user doesn't have a name set, fallback to annotation
          // pubkeys are already there in v1 (first release)
          if (!from) {
            ({ from } = noteValue);
          }
        }

        if (
          !from ||
          !timestamp ||
          !adnMessage.id ||
          !adnMessage.user ||
          !adnMessage.user.username ||
          !adnMessage.text
        ) {
          return; // Invalid message
        }

        const messageData = {
          serverId: adnMessage.id,
          friendRequest: false,
          source: adnMessage.user.username,
          sourceDevice: 1,
          timestamp,
          serverTimestamp: timestamp,
          receivedAt,
          isPublic: true,
          message: {
            body: adnMessage.text,
            attachments: [],
            group: {
              id: this.conversationId,
              type: textsecure.protobuf.GroupContext.Type.DELIVER,
            },
            flags: 0,
            expireTimer: 0,
            profileKey: null,
            timestamp,
            received_at: receivedAt,
            sent_at: timestamp,
            quote: null,
            contact: [],
            preview: [],
            profile: {
              displayName: from,
            },
          },
        };
        receivedAt += 1; // Ensure different arrival times

        this.serverAPI.chatAPI.emit('publicMessage', {
          message: messageData,
        });
        this.lastGot = !this.lastGot
          ? adnMessage.id
          : Math.max(this.lastGot, adnMessage.id);
      });
      this.conversation.setLastRetrievedMessage(this.lastGot);
    }

    this.timers.message = setTimeout(() => {
      this.pollForMessages();
    }, PUBLICCHAT_MSG_POLL_EVERY);
  }

  // create a message in the channel
  async sendMessage(text, messageTimeStamp, displayName, pubKey) {
    const payload = {
      text,
      annotations: [
        {
          type: 'network.loki.messenger.publicChat',
          value: {
            timestamp: messageTimeStamp,
            // will deprecated
            from: displayName,
            // will deprecated
            source: pubKey,
          },
        },
      ],
    };
    const res = await this.serverRequest(`${this.baseChannelUrl}/messages`, {
      method: 'POST',
      objBody: payload,
    });
    if (!res.err && res.response) {
      return res.response.data.id;
    }
    return false;
  }
}

module.exports = LokiPublicChatAPI;
