import { assert } from 'chai';
import os from 'os';

import { getUpdateFileName, getVersion } from '../../updater/common';

describe('updater/signatures', () => {
  const githubRelease = `[
  {
    "url": "https://api.github.com/repos/neuroscr/loki-messenger/releases/23917539",
    "assets_url": "https://api.github.com/repos/neuroscr/loki-messenger/releases/23917539/assets",
    "upload_url": "https://uploads.github.com/repos/neuroscr/loki-messenger/releases/23917539/assets{?name,label}",
    "html_url": "https://github.com/neuroscr/loki-messenger/releases/tag/v1.0.3",
    "id": 23917539,
    "node_id": "MDc6UmVsZWFzZTIzOTE3NTM5",
    "tag_name": "v1.0.3",
    "target_commitish": "clearnet",
    "name": "1.0.3",
    "draft": false,
    "author": {
      "login": "github-actions[bot]",
      "id": 41898282,
      "node_id": "MDM6Qm90NDE4OTgyODI=",
      "avatar_url": "https://avatars2.githubusercontent.com/in/15368?v=4",
      "gravatar_id": "",
      "url": "https://api.github.com/users/github-actions%5Bbot%5D",
      "html_url": "https://github.com/apps/github-actions",
      "followers_url": "https://api.github.com/users/github-actions%5Bbot%5D/followers",
      "following_url": "https://api.github.com/users/github-actions%5Bbot%5D/following{/other_user}",
      "gists_url": "https://api.github.com/users/github-actions%5Bbot%5D/gists{/gist_id}",
      "starred_url": "https://api.github.com/users/github-actions%5Bbot%5D/starred{/owner}{/repo}",
      "subscriptions_url": "https://api.github.com/users/github-actions%5Bbot%5D/subscriptions",
      "organizations_url": "https://api.github.com/users/github-actions%5Bbot%5D/orgs",
      "repos_url": "https://api.github.com/users/github-actions%5Bbot%5D/repos",
      "events_url": "https://api.github.com/users/github-actions%5Bbot%5D/events{/privacy}",
      "received_events_url": "https://api.github.com/users/github-actions%5Bbot%5D/received_events",
      "type": "Bot",
      "site_admin": false
    },
    "prerelease": false,
    "created_at": "2020-02-23T23:01:37Z",
    "published_at": "2020-02-24T03:41:18Z",
    "assets": [
      { "browser_download_url": "https://github.com/neuroscr/loki-messenger/releases/download/v1.0.3/session-messenger-desktop-linux-1.0.3.AppImage" },
      { "browser_download_url": "https://github.com/neuroscr/loki-messenger/releases/download/v1.0.3/session-messenger-desktop-mac-1.0.3.dmg" },
      { "browser_download_url": "https://github.com/neuroscr/loki-messenger/releases/download/v1.0.3/session-messenger-desktop-win-1.0.3.exe" }
    ],
    "tarball_url": "https://api.github.com/repos/neuroscr/loki-messenger/tarball/v1.0.3",
    "zipball_url": "https://api.github.com/repos/neuroscr/loki-messenger/zipball/v1.0.3",
    "body": ""
  }
]`;

  const windows = `version: 1.23.2
files:
  - url: signal-desktop-win-1.23.2.exe
    sha512: hhK+cVAb+QOK/Ln0RBcq8Rb1iPcUC0KZeT4NwLB25PMGoPmakY27XE1bXq4QlkASJN1EkYTbKf3oUJtcllziyQ==
    size: 92020776
path: signal-desktop-win-1.23.2.exe
sha512: hhK+cVAb+QOK/Ln0RBcq8Rb1iPcUC0KZeT4NwLB25PMGoPmakY27XE1bXq4QlkASJN1EkYTbKf3oUJtcllziyQ==
releaseDate: '2019-03-29T16:58:08.210Z'
`;
  const mac = `version: 1.23.2
files:
  - url: signal-desktop-mac-1.23.2.zip
    sha512: f4pPo3WulTVi9zBWGsJPNIlvPOTCxPibPPDmRFDoXMmFm6lqJpXZQ9DSWMJumfc4BRp4y/NTQLGYI6b4WuJwhg==
    size: 105179791
    blockMapSize: 111109
path: signal-desktop-mac-1.23.2.zip
sha512: f4pPo3WulTVi9zBWGsJPNIlvPOTCxPibPPDmRFDoXMmFm6lqJpXZQ9DSWMJumfc4BRp4y/NTQLGYI6b4WuJwhg==
releaseDate: '2019-03-29T16:57:16.997Z'
`;
  const windowsBeta = `version: 1.23.2-beta.1
files:
  - url: signal-desktop-beta-win-1.23.2-beta.1.exe
    sha512: ZHM1F3y/Y6ulP5NhbFuh7t2ZCpY4lD9BeBhPV+g2B/0p/66kp0MJDeVxTgjR49OakwpMAafA1d6y2QBail4hSQ==
    size: 92028656
path: signal-desktop-beta-win-1.23.2-beta.1.exe
sha512: ZHM1F3y/Y6ulP5NhbFuh7t2ZCpY4lD9BeBhPV+g2B/0p/66kp0MJDeVxTgjR49OakwpMAafA1d6y2QBail4hSQ==
releaseDate: '2019-03-29T01:56:00.544Z'
`;
  const macBeta = `version: 1.23.2-beta.1
files:
  - url: signal-desktop-beta-mac-1.23.2-beta.1.zip
    sha512: h/01N0DD5Jw2Q6M1n4uLGLTCrMFxcn8QOPtLR3HpABsf3w9b2jFtKb56/2cbuJXP8ol8TkTDWKnRV6mnqnLBDw==
    size: 105182398
    blockMapSize: 110894
path: signal-desktop-beta-mac-1.23.2-beta.1.zip
sha512: h/01N0DD5Jw2Q6M1n4uLGLTCrMFxcn8QOPtLR3HpABsf3w9b2jFtKb56/2cbuJXP8ol8TkTDWKnRV6mnqnLBDw==
releaseDate: '2019-03-29T01:53:23.881Z'
`;

  describe('#getVersion', () => {
    it('successfully gets version', () => {
      const expected = 'v1.0.3';
      assert.strictEqual(getVersion(githubRelease), expected);
      assert.strictEqual(getVersion(githubRelease), expected);

      /*
      const expectedBeta = '1.23.2-beta.1';
      assert.strictEqual(getVersion(windowsBeta), expectedBeta);
      assert.strictEqual(getVersion(macBeta), expectedBeta);
      */
    });
  });

  describe('#getUpdateFileName', () => {
    it('successfully gets version', () => {
      assert.strictEqual(
        getUpdateFileName(githubRelease, 'win32'),
        'https://github.com/neuroscr/loki-messenger/releases/download/v1.0.3/session-messenger-desktop-win-1.0.3.exe'
      );
      assert.strictEqual(
        getUpdateFileName(githubRelease, 'darwin'),
        'https://github.com/neuroscr/loki-messenger/releases/download/v1.0.3/session-messenger-desktop-mac-1.0.3.dmg'
      );
      assert.strictEqual(
        getUpdateFileName(githubRelease, 'linux'),
        'https://github.com/neuroscr/loki-messenger/releases/download/v1.0.3/session-messenger-desktop-linux-1.0.3.AppImage'
      );
      /*
      assert.strictEqual(
        getUpdateFileName(windowsBeta),
        'signal-desktop-beta-win-1.23.2-beta.1.exe'
      );
      assert.strictEqual(
        getUpdateFileName(macBeta),
        'signal-desktop-beta-mac-1.23.2-beta.1.zip'
      );
      */
    });
  });
});
