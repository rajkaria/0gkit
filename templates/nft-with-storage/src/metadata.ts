export interface NftMetadataInput {
  name: string;
  description: string;
  mediaRoot: string;
  attributes?: { trait_type: string; value: string }[];
}

export interface NftMetadata {
  name: string;
  description: string;
  image: string;
  attributes?: { trait_type: string; value: string }[];
}

export function buildMetadata(input: NftMetadataInput): NftMetadata {
  if (!input.name || input.name.trim().length === 0) {
    throw new Error("name must not be empty");
  }
  if (!input.mediaRoot.startsWith("0x")) {
    throw new Error("mediaRoot must be a hex Merkle root");
  }
  return {
    name: input.name,
    description: input.description,
    image: `0g-storage://${input.mediaRoot}`,
    ...(input.attributes ? { attributes: input.attributes } : {}),
  };
}

export function parseMetadata(bytes: Uint8Array): NftMetadata {
  return JSON.parse(new TextDecoder().decode(bytes)) as NftMetadata;
}
