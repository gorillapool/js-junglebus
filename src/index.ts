import {
  Address,
  BlockHeader,
  Client,
  ClientOptions,
  ControlMessage,
  ControlMessageStatusCode,
  Transaction,
  TransactionMessage,
} from "./interface";
import Centrifuge from 'centrifuge/build/protobuf';
import { JungleBusSubscription } from "./subscription";
import { SubscriptionErrorContext } from "centrifuge";
import "cross-fetch/polyfill";

let ws: any;
if (typeof window === "undefined") {
  ws = require('ws');
}

/**
 * JungleBusClient class
 *
 * @constructor
 * @example
 * const jungleBusClient = new JungleBusClient(<serverUrl>, {
 *   protocol: 'protobuf',
 * })
 */
export class JungleBusClient {
  client: Client;

  constructor(serverUrl: string, options?: ClientOptions) {
    this.client = (options || {}) as Client;
    if (!this.client.protocol) {
      this.client.protocol = 'json';
    }
    if (typeof options?.useSSL === "undefined") {
      this.client.useSSL = !(serverUrl.match(/^http:/) || serverUrl.match(/^ws:/));
    }

    // remove https / wss from server url is defined
    this.client.serverUrl = serverUrl.replace(/^https?:\/\//, '').replace(/^wss?:\/\//, '');
  }

  /**
   * Login to the JungleBus server and get a token
   *
   * @param username
   * @param password
   * @return error | null
   */
  async Login(username: string, password: string): Promise<Error | null> {
    try {
      const response = await fetch(`${this.client.useSSL ? 'https' : 'http'}://${this.client.serverUrl}/v1/user/login`, {
        method: 'POST',
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          username,
          password,
        })
      });
      if (response.status !== 200) {
        this.client.error = new Error(response.statusText);
        return null;
      }

      const body = await response.json();
      this.SetToken(body.token);

      return null;
    } catch(e: any) {
      this.client.error = e;
      return e;
    }
  }

  private getToken() {
    return this.client.token
  }

  /**
   * Set the JWT token to use in all calls
   *
   * @param token string
   * @constructor
   */
  SetToken(token: string) {
    return this.client.token = token;
  }

  /**
   * Get an anonymous token based on a subscription ID to the JungleBus server
   *
   * @param subscriptionId
   * @return error | null
   */
  async GetTokenFromSubscription(subscriptionId: string): Promise<Error | null> {
    try {
      const response = await fetch(`${this.client.useSSL ? 'https' : 'http'}://${this.client.serverUrl}/v1/user/subscription-token`, {
        method: 'POST',
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          id: subscriptionId,
        })
      });
      if (response.status !== 200) {
        this.client.error = new Error(response.statusText);
        return null;
      }

      const body = await response.json();
      this.SetToken(body.token);

      return null;
    } catch(e: any) {
      this.client.error = e;
      return e;
    }
  }

  /**
   * Return the last error thrown
   *
   * @return Error
   */
  GetLastError(): Error | undefined {
    return this.client?.error;
  }

  /**
   * Create the connection to the JungleBus server
   *
   * @return void
   */
  Connect(): void {
    const self = this;
    const client = this.client;

    client.centrifuge = new Centrifuge(`${this.client.useSSL ? 'wss' : 'ws'}://${client.serverUrl}/connection/websocket${(client.protocol === "protobuf" ? '?format=protobuf' : '')}`, {
      protocol: client.protocol,
      debug: client.debug,
      websocket: typeof window !== "undefined" ? window.WebSocket : ws,
      timeout: 5000,
      maxServerPingDelay: 30000,
      getToken: function () {
        return new Promise((resolve, reject) => {
          fetch(`${client.useSSL ? 'https' : 'http'}://${client.serverUrl}/v1/user/refresh-token`, {
            headers: {
              token: self.getToken() || '',
            }
          })
            .then(res => {
              if (!res.ok) {
                throw new Error(`Unexpected status code ${res.status}`);
              }
              return res.json();
            })
            .then(data => {
              // update the token
              self.SetToken(data.token);
              resolve(data.token);
            })
            .catch(err => {
              reject(err);
            });
        });
      },
    });

    if (client.onConnected) {
      client.centrifuge.on('connected', client.onConnected);
    }
    if (client.onConnecting) {
      client.centrifuge.on('connecting', client.onConnecting);
    }
    if (client.onDisconnected) {
      client.centrifuge.on('disconnected', client.onDisconnected);
    }
    if (client.onError) {
      client.centrifuge.on('error', client.onError);
    }

    client.centrifuge.connect();
  }

  /**
   * Disconnect the client from the server
   *
   * @return void
   */
  Disconnect(): void {
    this.client.centrifuge.disconnect();
  }

  /**
   * Subscribe to a channel on the JungleBus server
   *
   * @param subscriptionID
   * @param fromBlock
   * @param onPublish
   * @param onStatus
   * @param onError
   * @param onMempool
   * @return JungleBusSubscription
   */
  async Subscribe(
    subscriptionID: string,
    fromBlock: number,
    onPublish?: (tx: Transaction) => void,
    onStatus?: (message: ControlMessage) => void,
    onError?: (error: SubscriptionErrorContext) => void,
    onMempool?: (tx: Transaction) => void,
    liteMode = false
  ): Promise<JungleBusSubscription> {
    if (!this.client.token) {
      // we do not have a token yet, sign in anonymously with the subscription id
      await this.GetTokenFromSubscription(subscriptionID)
    }

    // Connect to the backend, if we do not have a connection yet
    if (!this.client.centrifuge) {
      this.Connect();
    }

    return new JungleBusSubscription(this.client, subscriptionID, fromBlock, 
      async  (tx) => {
        if (onPublish) {
          if(!tx.transaction.length && !liteMode) {
            const url = `${this.client.useSSL ? 'https' : 'http'}://${this.client.serverUrl}/v1/transaction/get/${tx.id}/bin`;
            const resp = await fetch(url);
            tx.transaction = Buffer.from(await resp.arrayBuffer()).toString('hex')
          }
          onPublish(tx);
        }
      }, 
      onStatus, 
      onError, 
      async  (tx) => {
        if (onMempool) {
          if(!tx.transaction.length && !liteMode) {
            const url = `${this.client.useSSL ? 'https' : 'http'}://${this.client.serverUrl}/v1/transaction/get/${tx.id}/bin`;
            const resp = await fetch(url);
            tx.transaction = Buffer.from(await resp.arrayBuffer()).toString('hex')
          }
          onMempool(tx);
        }
      },
      liteMode);
  }

  /**
   *  Get a transaction from the JungleBus API
   *
   * @param txId Transaction ID in hex
   * @return Promise<Transaction> | null
   */
  async GetTransaction(txId: string): Promise<Transaction | null> {
    const url = `${this.client.useSSL ? 'https' : 'http'}://${this.client.serverUrl}/v1/transaction/get/${txId}`;
    return await this.apiRequest(url);
  }


  /**
   *  Get block header info from JungleBus
   *
   * @param block Block header height or hash
   * @return Promise<BlockHeader> | null
   */
  async GetBlockHeader(block: string | number): Promise<BlockHeader | null> {
    const url = `${this.client.useSSL ? 'https' : 'http'}://${this.client.serverUrl}/v1/block_header/get/${block}`;
    return await this.apiRequest(url);
  }

  /**
   *  Get a list of block headers from JungleBus
   *
   * @param fromBlock Block header height or hash
   * @param limit Limit the number of results to this number (max 10,000)
   * @return Promise<BlockHeader> | null
   */
  async GetBlockHeaders(fromBlock: string | number, limit: number): Promise<BlockHeader[] | null> {
    const url = `${this.client.useSSL ? 'https' : 'http'}://${this.client.serverUrl}/v1/block_header/list/${fromBlock}?limit=${limit}`;
    return await this.apiRequest(url);
  }

  /**
   *  Get all transaction references for the given address
   *
   * @param address Bitcoin address
   * @return Promise<BlockHeader> | null
   */
  async GetAddressTransactions(address: string): Promise<Address[] | null> {
    const url = `${this.client.useSSL ? 'https' : 'http'}://${this.client.serverUrl}/v1/address/get/${address}`;
    return await this.apiRequest(url);
  }

  /**
   *  Get all transactions, including the hex and merkle proof, for the given address
   *
   *  This function is much slower than GetAddressTransactions
   *
   * @param address Bitcoin address
   * @return Promise<BlockHeader> | null
   */
  async GetAddressTransactionDetails(address: string): Promise<Address[] | null> {
    const url = `${this.client.useSSL ? 'https' : 'http'}://${this.client.serverUrl}/v1/address/transactions/${address}`;
    return await this.apiRequest(url);
  }

  private async apiRequest(url: string) {
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          "content-type": "application/json",
          token: this.getToken() || '',
        },
      });
      if (response.status !== 200) {
        this.client.error = new Error(response.statusText);
        return null;
      }

      return await response.json();
    } catch (e: any) {
      this.client.error = e;
      throw e;
    }
  }
}

export {
  Client,
  ClientOptions,
  ControlMessage,
  ControlMessageStatusCode,
  JungleBusSubscription,
  Transaction,
  TransactionMessage,
};
