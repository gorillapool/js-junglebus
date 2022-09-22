import {
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
      this.client.token = body.token;

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
      this.client.token = body.token;

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
  ): Promise<JungleBusSubscription> {
    if (!this.client.token) {
      // we do not have a token yet, sign in anonymously with the subscription id
      await this.GetTokenFromSubscription(subscriptionID)
    }

    // Connect to the backend, if we do not have a connection yet
    if (!this.client.centrifuge) {
      this.Connect();
    }

    return new JungleBusSubscription(this.client, subscriptionID, fromBlock, onPublish, onStatus, onError, onMempool);
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
