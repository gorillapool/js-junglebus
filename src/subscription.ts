import { PublicationContext, Subscription, SubscriptionErrorContext } from "centrifuge";
import Queue from 'better-queue';

import { Client, ControlMessage, ControlMessageStatusCode, Transaction, TransactionMessage } from "./interface";
import { ProtobufRoot } from "./protobuf";
import BetterQueue from "better-queue";

/**
 * JungleBusSubscription class
 *
 * @constructor
 * @example
 * const jungleBusClient = new JungleBusSubscription(options: Subscription)
 */
export class JungleBusSubscription {
  MaxQueueSize: number = 20;

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

  private subscriptionQueue: BetterQueue;
  private controlQueue: BetterQueue;
  private mempoolQueue: BetterQueue;

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

    this.subscriptionQueue = new Queue(async function (tx, cb) {
      if (onPublish) {
        onPublish(tx)
      }
      cb(null, true);
    });
    this.controlQueue = new Queue(async function (message, cb) {
      if (onStatus) {
        onStatus(message)
      }
      cb(null, true);
    });
    this.mempoolQueue = new Queue(async function (tx, cb) {
      if (onMempool) {
        onMempool(tx)
      }
      cb(null, true);
    });

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
          this.controlQueue.push(message);
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
        this.mempoolQueue.push(tx);
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

    let pauseTimeOut: ReturnType<typeof setTimeout>;

    const self = this;
    this.subscription = self.client.centrifuge.newSubscription(channel);

    function pauseProcessing() {
      return setTimeout(() => {
        // @ts-ignore
        const queueLength = self.subscriptionQueue.length;
        if (queueLength < self.MaxQueueSize / 2) {
          self.subscription?.publish({ cmd: 'start' });
        } else {
          pauseTimeOut = pauseProcessing();
        }
      }, 2000);
    }

    this.subscription
      .on('publication', (ctx) => {
        if (this.onPublish) {
          const tx = self.processTransaction(self, ctx);
          this.subscriptionQueue.push(tx)
          // @ts-ignore
          const queueLength = self.subscriptionQueue.length;
          if (queueLength > self.MaxQueueSize) {
            self.subscription?.publish({cmd: 'pause'});
            if (pauseTimeOut) {
              clearTimeout(pauseTimeOut);
            }
            pauseTimeOut = pauseProcessing();
          }
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
        // transactions can be missing, which means they are stored in S3
        transaction: ctx.data.transaction ? typeof Buffer !== "undefined" ? Buffer.from(ctx.data.transaction, 'base64').toString('hex') : base64ToHex(ctx.data.transaction) : '',
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
