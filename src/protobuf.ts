import protobuf from "protobufjs";

export const ProtobufDef = {
  nested: {
    Transaction: {
      fields: {
        id: {
          type: "string",
          id: 1,
        },
        block_hash: {
          type: "string",
          id: 2,
        },
        block_height: {
          type: "uint32",
          id: 3,
        },
        block_index: {
          type: "uint64",
          id: 4,
        },
        block_time: {
          type: "uint32",
          id: 5,
        },
        transaction: {
          type: "bytes",
          id: 6,
        },
        merkle_proof: {
          type: "bytes",
          id: 7,
        },
      }
    },
    ControlResponse: {
      fields: {
        statusCode: {
          type: "uint32",
          id: 1,
        },
        status: {
          type: "string",
          id: 2,
        },
        message: {
          type: "string",
          id: 3,
        },
        block: {
          type: "uint32",
          id: 4,
        },
        transactions: {
          type: "uint64",
          id: 5,
        }
      }
    }
  }
};
export const ProtobufRoot = protobuf.Root.fromJSON(ProtobufDef);
