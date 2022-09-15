import { PublicationContext, Subscription, SubscriptionErrorContext } from "centrifuge";

import { Client, ControlMessage, ControlMessageStatusCode, Transaction, TransactionMessage } from "./interface";
import { ProtobufRoot } from "./protobuf";

/**
 * JungleBusSubscription class
 *
 * @constructor
 * @example
 * const jungleBusClient = new JungleBusSubscription(options: Subscription)
 */
export class JungleBusSubscription {
  client: Client;
  subscription: Subscription | undefined;
  controlSubscription: Subscription | undefined;
  mempoolSubscription: Subscription | undefined;
  subscriptionID: string;
  currentBlock: number;
  onPublish?: (tx: Transaction) => void;
  onMempool?: (tx: Transaction) => void;
  onStatus?: (message: ControlMessage) => void;
  onError?: (error: SubscriptionErrorContext) => void;
  subscribed: boolean;
  controlSubscribed: boolean;
  mempoolSubscribed: boolean;
  error: SubscriptionErrorContext | undefined;

  constructor(
    client: Client,
    subscriptionID: string,
    fromBlock: number,
    onPublish?: (tx: Transaction) => void,
    onStatus?: (message: ControlMessage) => void,
    onError?: (error: SubscriptionErrorContext) => void,
    onMempool?: (tx: Transaction) => void,
  ) {
    this.client = client;
    this.subscriptionID = subscriptionID;
    this.currentBlock = fromBlock;
    this.onPublish = onPublish;
    this.onMempool = onMempool;
    this.onStatus = onStatus;
    this.onError = onError;

    this.subscribed = false;
    this.controlSubscribed = false;
    this.mempoolSubscribed = false;

    this.Subscribe();
  }

  /**
   * Start the subscription
   *
   * @return void
   */
  Subscribe(): void {
    if (this.subscription || this.controlSubscription || this.mempoolSubscription) {
      // if the subscriptions are active, unsubscribe and then re-subscribe
      this.UnSubscribe();
    }

    if (this.onMempool) {
      this.subscribeMempool();
    }

    if (this.onPublish) {
      this.subscribeControlMessage();
      this.subscribeTransactionBlocks();
    }
  }

  private subscribeControlMessage() {
    const self = this;
    const controlChannel = `query:${self.subscriptionID}:control`;

    this.controlSubscription = this.client.centrifuge.newSubscription(controlChannel);
    this.controlSubscription.on('publication', (ctx) => {
      let message: ControlMessage;
      if (this.client.protocol === "protobuf") {
        const Message = ProtobufRoot.lookupType("ControlResponse");
        message = Message.decode(ctx.data) as unknown as ControlMessage;
      } else {
        message = ctx.data;
      }


      if (message.statusCode === ControlMessageStatusCode.ERROR) {
        if (self.onError) {
          self.onError({
            channel: ctx.channel,
            type: message.status,
            error: {
              code: message.statusCode,
              message: message.status
            },
          });
        }
      } else {
        if (message.statusCode === ControlMessageStatusCode.BLOCK_DONE) {
          this.currentBlock = message.block;
        }

        if (this.onStatus) {
          this.onStatus(message);
        } else {
          //console.log(message);
        }
      }
    })
      .on("subscribed", function (ctx) {
        self.controlSubscribed = true;
      })
      .on("error", function (error) {
        self.error = error;
        if (self.onError) {
          self.onError(error);
        }
      });
    this.controlSubscription.subscribe();
  }

  private subscribeMempool() {
    const self = this;
    const mempoolChannel = `query:${self.subscriptionID}:mempool`;

    this.mempoolSubscription = self.client.centrifuge.newSubscription(mempoolChannel);
    this.mempoolSubscription.on('publication', (ctx) => {
      if (this.onMempool) {
        const tx = this.processTransaction(self, ctx);
        this.onMempool(tx);
      }
    })
      .on("subscribed", function (ctx) {
        self.mempoolSubscribed = true;
      })
      .on("error", function (error) {
        self.error = error;
        if (self.onError) {
          self.onError(error);
        }
      });
    this.mempoolSubscription.subscribe();
  }

  private subscribeTransactionBlocks(): void {
    const channel = `query:${this.subscriptionID}:${this.currentBlock}`;

    const self = this;
    this.subscription = self.client.centrifuge.newSubscription(channel);
    this.subscription
      .on('publication', (ctx) => {
        const tx = this.processTransaction(self, ctx);
        if (this.onPublish) {
          this.onPublish(tx);
        }
      })
      .on("subscribed", function (ctx) {
        self.subscribed = true;
      })
      .on("state", function (ctx) {
        if (ctx.oldState === "subscribed" && ctx.newState === "subscribing") {
          // make sure we are subscribing to the correct channel
          const ch = ctx.channel.split(":");
          if (ch[2]?.match(/^\d+$/) && Number(ch[2]) !== self.currentBlock) {
            // reset this subscription to set the correct block height
            self.unsubscribeTransactionBlocks();
            self.subscribeTransactionBlocks();
          }
        }
      })
      .on("error", function (error) {
        self.error = error;
        if (self.onError) {
          self.onError(error);
        }
      });

    this.subscription?.subscribe();
  }

  protected processTransaction(self: this, ctx: PublicationContext) {
    if (self.client.protocol === "protobuf") {
      const Message = ProtobufRoot.lookupType("Transaction");
      const message = Message.decode(ctx.data) as unknown as TransactionMessage;
      return {
        ...message,
        transaction: toHexString(message.transaction),
        // merkle proofs are missing from mempool transactions
        merkle_proof: message.merkle_proof ? toHexString(message.merkle_proof) : '',
      };
    } else {
      return {
        ...ctx.data,
        transaction: typeof Buffer !== "undefined" ? Buffer.from(ctx.data.transaction, 'base64').toString('hex') : base64ToHex(ctx.data.transaction),
        // merkle proofs are missing from mempool transactions
        merkle_proof: ctx.data.merkle_proof ? (typeof Buffer !== "undefined" ? Buffer.from(ctx.data.merkle_proof, 'base64').toString('hex') : base64ToHex(ctx.data.merkle_proof)) : '',
      };
    }
  }

  /**
   * Get the current last block that was processed completely
   *
   * @return number
   */
  GetCurrentBlock(): number {
    return this.currentBlock;
  }

  /**
   * Unsubscribe from this subscription
   *
   * @return void
   */
  UnSubscribe(): void {
    if (this.subscription) {
      this.unsubscribeTransactionBlocks();
    }

    if (this.mempoolSubscription) {
      this.mempoolSubscription.unsubscribe();
      this.mempoolSubscription.removeAllListeners();
      this.client.centrifuge.removeSubscription(this.mempoolSubscription);
      this.mempoolSubscription = undefined;
      this.mempoolSubscribed = false;
    }

    if (this.controlSubscription) {
      this.controlSubscription.unsubscribe();
      this.controlSubscription.removeAllListeners();
      this.client.centrifuge.removeSubscription(this.controlSubscription);
      this.controlSubscription = undefined;
      this.controlSubscribed = false;
    }
  }

  private unsubscribeTransactionBlocks() {
    if (this.subscription) {
      this.subscription.unsubscribe();
      this.subscription.removeAllListeners();
      this.client.centrifuge.removeSubscription(this.subscription);
      this.subscription = undefined;
      this.subscribed = false;
    }
  }
}

function toHexString(byteArray: Uint8Array) {
  return Array.from(byteArray, function (byte) {
    return ('0' + (byte & 0xFF).toString(16)).slice(-2);
  }).join('').toLowerCase();
}

function base64ToHex(str: string) {
  const raw = atob(str);
  let result = '';
  for (let i = 0; i < raw.length; i++) {
    const hex = raw.charCodeAt(i).toString(16);
    result += (hex.length === 2 ? hex : '0' + hex);
  }
  return result.toLowerCase();
}
