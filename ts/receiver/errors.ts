import { initIncomingMessage } from './dataMessage';
import { toNumber } from 'lodash';
import { ConversationController } from '../session/conversations';
import { MessageController } from '../session/messages';

export async function onError(ev: any) {
  const { error } = ev;
  window.log.error(
    'background onError:',
    window.Signal.Errors.toLogFormat(error)
  );

  if (ev.proto) {
    const envelope = ev.proto;

    const message = initIncomingMessage(envelope);

    message.saveErrors(error || new Error('Error was null'));
    const id = message.get('conversationId');
    const conversation = await ConversationController.getInstance().getOrCreateAndWait(
      id,
      'private'
    );
    // force conversation unread count to be > 0 so it is highlighted
    conversation.set({
      active_at: Date.now(),
      unreadCount: toNumber(conversation.get('unreadCount')) + 1,
    });

    const conversationTimestamp = conversation.get('timestamp');
    const messageTimestamp = message.get('timestamp');
    if (!conversationTimestamp || messageTimestamp > conversationTimestamp) {
      conversation.set({ timestamp: message.get('sent_at') });
    }

    conversation.updateLastMessage();
    MessageController.getInstance().register(message.id, message);
    window.Whisper.events.trigger('messageAdded', {
      conversationKey: conversation.id,
      messageModel: message,
    });

    conversation.notify(message);

    if (ev.confirm) {
      ev.confirm();
    }
    await conversation.commit();
  }

  throw error;
}
