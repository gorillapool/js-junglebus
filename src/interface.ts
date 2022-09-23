import {
  Centrifuge,
  ConnectedContext,
  ConnectingContext,
  DisconnectedContext,
  ErrorContext,
} from "centrifuge";
import protobuf from "protobufjs";

export interface Client {
  centrifuge: Centrifuge;
  serverUrl: string;
  protocol: "protobuf" | "json" | undefined;
  useSSL?: boolean;
  token?: string;
  onConnecting?: (ctx: ConnectingContext) => void;
  onDisconnected?: (ctx: DisconnectedContext) => void;
  onConnected?: (ctx: ConnectedContext) => void;
  onError?: (ctx: ErrorContext) => void;
  debug?: boolean;
  error?: Error;
}

export interface PaymentRequest {
  tx: string; // transaction template
}

export interface ClientOptions {
  protocol: "protobuf" | "json" | undefined;
  useSSL?: boolean;
  token?: string;
  onConnecting?: (ctx: ConnectingContext) => void;
  onDisconnected?: (ctx: DisconnectedContext) => void;
  onConnected?: (ctx: ConnectedContext) => void;
  onError?: (ctx: ErrorContext) => void;
  onPayment?: (request: PaymentRequest) => void;
  debug?: boolean;
}

export interface Address {
  id: string;
  address: string;
  transaction_id: string;
  block_hash: string;
  transaction_num: number;
}

export interface BlockHeader {
  hash: string;
  coin: number;
  height: number;
  time: number;
  nonce: number;
  version: number;
  merkleroot: string;
  bits: string;
  synced: number;
}

export interface Transaction {
  id: string;
  block_hash: string;
  block_height: number;
  block_index: number;
  block_time: number;
  transaction: string;
  merkle_proof: string;
}

export interface TransactionMessage {
  id: string;
  block_hash: string;
  block_height: number;
  block_index: number;
  block_time: number;
  transaction: protobuf.Buffer;
  merkle_proof: protobuf.Buffer;
}

export enum ControlMessageStatusCode {
  WAITING = 100,
  ERROR = 101,
  BLOCK_DONE = 200,
  REORG = 300,
}

export interface ControlMessage {
  statusCode: ControlMessageStatusCode;
  status: string;
  message: string;
  block: number;
  transactions: number;
}
