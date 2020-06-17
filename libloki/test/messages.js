/* global assert */

describe('Loki Messages', () => {
  describe('#backgroundMessage', () => {
    it('structure is valid', () => {
      const pubkey =
        '05050505050505050505050505050505050505050505050505050505050505050';
      const backgroundMessage = window.textsecure.OutgoingMessage.buildBackgroundMessage(
        pubkey
      );

      const validBackgroundObject = {
        server: null,
        numbers: [pubkey],
        // For now, a background message contains only a loki address message as
        // it must not be an empty message for android
      };

      const validBgMessage = {
        dataMessage: null,
        syncMessage: null,
        callMessage: null,
        nullMessage: null,
        receiptMessage: null,
        typingMessage: null,
        preKeyBundleMessage: null,
        pairingAuthorisation: null,
      };

      const lokiAddressMessage = {
        p2pAddress: null,
        p2pPort: null,
        type: 1,
      };

      assert.isNumber(backgroundMessage.timestamp);
      assert.isFunction(backgroundMessage.callback);
      assert.deepInclude(backgroundMessage, validBackgroundObject);
      assert.deepInclude(backgroundMessage.message, validBgMessage);
      assert.deepInclude(
        backgroundMessage.message.lokiAddressMessage,
        lokiAddressMessage
      );
    });
  });
});
