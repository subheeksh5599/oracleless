// ORACLELESS — on-chain config (Shannon testnet)
// Source of truth: deployed contracts. Verified addresses from the DreamDEX docs
// (contracts-and-addresses) + this repo's deployments/.

export const CHAIN_ID = 50312;
export const RPC_URL = "https://dream-rpc.somnia.network";
export const INDEXER_URL = "https://dev.smk.somnia.host/v1/graphql";
export const EXPLORER_URL = "https://shannon-explorer.somnia.network";

// DreamDEX canonical contracts (CREATE3: identical testnet/mainnet)
export const BINARY_MODULE = "0x3ecC694Cef705358864a646142ac17A90E29e388";
export const BINARY_SETTLEMENT = "0xbF4a49e0Dfd092e5FBE8E5761064C49533e6Ed23";
export const TUSDC = "0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E";
export const TUSDC_DECIMALS = 6;

// ORACLELESS ConditionVault — filled after deploy
export const CONDITION_VAULT = import.meta.env.VITE_CONDITION_VAULT ?? "";

export const somniaShannon = {
  id: CHAIN_ID,
  name: "Somnia Shannon",
  nativeCurrency: { name: "STT", symbol: "STT", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
  blockExplorers: {
    default: { name: "Shannon Explorer", url: EXPLORER_URL },
  },
} as const;

export const vaultAbi = [
  {
    type: "function",
    name: "createCondition",
    stateMutability: "nonpayable",
    inputs: [
      { name: "marketId_", type: "bytes32" },
      { name: "collateral_", type: "address" },
      { name: "expected_", type: "uint8" },
      { name: "recipient_", type: "address" },
      { name: "amount_", type: "uint256" },
      { name: "expiry_", type: "uint64" },
    ],
    outputs: [{ name: "conditionId", type: "uint256" }],
  },
  {
    type: "function",
    name: "execute",
    stateMutability: "nonpayable",
    inputs: [{ name: "conditionId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "reclaim",
    stateMutability: "nonpayable",
    inputs: [{ name: "conditionId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "conditionState",
    stateMutability: "view",
    inputs: [{ name: "conditionId", type: "uint256" }],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    type: "function",
    name: "getCondition",
    stateMutability: "view",
    inputs: [{ name: "conditionId", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "marketId", type: "bytes32" },
          { name: "market", type: "address" },
          { name: "collateral", type: "address" },
          { name: "expected", type: "uint8" },
          { name: "recipient", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "expiry", type: "uint64" },
          { name: "creator", type: "address" },
          { name: "state", type: "uint8" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "conditionCount",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "binaryModule",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
] as const;

export const erc20Abi = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;
