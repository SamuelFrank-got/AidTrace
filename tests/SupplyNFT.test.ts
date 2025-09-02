import { describe, expect, it, vi, beforeEach } from "vitest";

// Interfaces for type safety
interface ClarityResponse<T> {
  ok: boolean;
  value: T | number; // number for error codes
}

interface TokenMetadata {
  uri: string;
  supplyType: string;
  quantity: number;
  expiration: number | null;
  description: string;
  tags: string[];
  locked: boolean;
}

interface TokenVersion {
  version: number;
  updatedUri: string;
  notes: string;
  timestamp: number;
}

interface TokenStatus {
  status: string;
  lastUpdated: number;
}

interface TokenLicense {
  licensee: string;
  expiry: number;
  terms: string;
  active: boolean;
}

interface Collaborator {
  collaborator: string;
  role: string;
  permissions: string[];
  addedAt: number;
}

interface ContractState {
  owners: Map<number, string>;
  metadata: Map<number, TokenMetadata>;
  versions: Map<number, TokenVersion[]>;
  statuses: Map<number, TokenStatus>;
  licenses: Map<number, TokenLicense[]>;
  collaborators: Map<number, Collaborator[]>;
  lastTokenId: number;
  paused: boolean;
  contractOwner: string;
  registryContract: string | null;
}

// Mock contract implementation
class SupplyNFTMock {
  private state: ContractState = {
    owners: new Map(),
    metadata: new Map(),
    versions: new Map(),
    statuses: new Map(),
    licenses: new Map(),
    collaborators: new Map(),
    lastTokenId: 0,
    paused: false,
    contractOwner: "deployer",
    registryContract: null,
  };

  private ERR_NOT_OWNER = 100;
  private ERR_TOKEN_NOT_FOUND = 101;
  private ERR_INVALID_URI = 102;
  private ERR_INVALID_METADATA = 103;
  private ERR_NOT_AUTHORIZED = 104;
  private ERR_INVALID_QUANTITY = 106;
  private ERR_TOKEN_LOCKED = 108;
  private ERR_INVALID_RECIPIENT = 109;
  private ERR_TOO_MANY_TAGS = 112;
  private ERR_NOT_VERIFIED = 113;
  private ERR_INVALID_VERSION = 114;
  private ERR_ALREADY_UPDATED = 115;
  private ERR_INVALID_STATUS = 116;
  private ERR_PAUSED = 117;
  private ERR_NOT_ADMIN = 118;
  private ERR_INVALID_DURATION = 119;
  private ERR_LICENSE_EXPIRED = 120;
  private MAX_TAGS = 10;
  private MAX_VERSIONS = 5;
  private MAX_METADATA_LEN = 500;

  // Simulate block-height
  private currentBlockHeight = 100;

  private incrementBlockHeight() {
    this.currentBlockHeight += 1;
  }

  setRegistryContract(caller: string, newRegistry: string): ClarityResponse<boolean> {
    if (caller !== this.state.contractOwner) {
      return { ok: false, value: this.ERR_NOT_ADMIN };
    }
    this.state.registryContract = newRegistry;
    return { ok: true, value: true };
  }

  pause(caller: string): ClarityResponse<boolean> {
    if (caller !== this.state.contractOwner) {
      return { ok: false, value: this.ERR_NOT_ADMIN };
    }
    this.state.paused = true;
    return { ok: true, value: true };
  }

  unpause(caller: string): ClarityResponse<boolean> {
    if (caller !== this.state.contractOwner) {
      return { ok: false, value: this.ERR_NOT_ADMIN };
    }
    this.state.paused = false;
    return { ok: true, value: true };
  }

  mint(
    caller: string,
    recipient: string,
    uri: string,
    supplyType: string,
    quantity: number,
    expiration: number | null,
    description: string,
    tags: string[]
  ): ClarityResponse<number> {
    if (this.state.paused) {
      return { ok: false, value: this.ERR_PAUSED };
    }
    // Simulate verification check - assume true for verified callers
    if (caller.startsWith("unverified")) {
      return { ok: false, value: this.ERR_NOT_VERIFIED };
    }
    if (uri.length === 0) {
      return { ok: false, value: this.ERR_INVALID_URI };
    }
    if (quantity <= 0) {
      return { ok: false, value: this.ERR_INVALID_QUANTITY };
    }
    if (description.length > this.MAX_METADATA_LEN) {
      return { ok: false, value: this.ERR_INVALID_METADATA };
    }
    if (tags.length > this.MAX_TAGS) {
      return { ok: false, value: this.ERR_TOO_MANY_TAGS };
    }
    const newId = this.state.lastTokenId + 1;
    this.state.owners.set(newId, recipient);
    this.state.metadata.set(newId, {
      uri,
      supplyType,
      quantity,
      expiration,
      description,
      tags,
      locked: false,
    });
    this.state.statuses.set(newId, {
      status: "minted",
      lastUpdated: this.currentBlockHeight,
    });
    this.state.lastTokenId = newId;
    this.incrementBlockHeight();
    return { ok: true, value: newId };
  }

  transfer(caller: string, tokenId: number, sender: string, recipient: string): ClarityResponse<boolean> {
    if (this.state.paused) {
      return { ok: false, value: this.ERR_PAUSED };
    }
    const owner = this.state.owners.get(tokenId);
    if (!owner || owner !== sender) {
      return { ok: false, value: this.ERR_NOT_OWNER };
    }
    const metadata = this.state.metadata.get(tokenId);
    if (!metadata) {
      return { ok: false, value: this.ERR_TOKEN_NOT_FOUND };
    }
    if (metadata.locked) {
      return { ok: false, value: this.ERR_TOKEN_LOCKED };
    }
    if (recipient === "invalid") {
      return { ok: false, value: this.ERR_INVALID_RECIPIENT };
    }
    this.state.owners.set(tokenId, recipient);
    this.state.statuses.set(tokenId, {
      status: "transferred",
      lastUpdated: this.currentBlockHeight,
    });
    this.incrementBlockHeight();
    return { ok: true, value: true };
  }

  burn(caller: string, tokenId: number): ClarityResponse<boolean> {
    if (this.state.paused) {
      return { ok: false, value: this.ERR_PAUSED };
    }
    const owner = this.state.owners.get(tokenId);
    if (!owner || owner !== caller) {
      return { ok: false, value: this.ERR_NOT_OWNER };
    }
    this.state.owners.delete(tokenId);
    this.state.metadata.delete(tokenId);
    this.state.versions.delete(tokenId);
    this.state.statuses.delete(tokenId);
    this.state.licenses.delete(tokenId);
    this.state.collaborators.delete(tokenId);
    return { ok: true, value: true };
  }

  updateMetadata(caller: string, tokenId: number, newUri: string, newDescription: string): ClarityResponse<boolean> {
    if (this.state.paused) {
      return { ok: false, value: this.ERR_PAUSED };
    }
    const owner = this.state.owners.get(tokenId);
    if (!owner || owner !== caller) {
      return { ok: false, value: this.ERR_NOT_OWNER };
    }
    let metadata = this.state.metadata.get(tokenId);
    if (!metadata) {
      return { ok: false, value: this.ERR_TOKEN_NOT_FOUND };
    }
    if (newUri.length === 0) {
      return { ok: false, value: this.ERR_INVALID_URI };
    }
    if (newDescription.length > this.MAX_METADATA_LEN) {
      return { ok: false, value: this.ERR_INVALID_METADATA };
    }
    metadata = { ...metadata, uri: newUri, description: newDescription };
    this.state.metadata.set(tokenId, metadata);
    this.state.statuses.set(tokenId, {
      status: "metadata-updated",
      lastUpdated: this.currentBlockHeight,
    });
    this.incrementBlockHeight();
    return { ok: true, value: true };
  }

  addVersion(caller: string, tokenId: number, version: number, updatedUri: string, notes: string): ClarityResponse<boolean> {
    if (this.state.paused) {
      return { ok: false, value: this.ERR_PAUSED };
    }
    const owner = this.state.owners.get(tokenId);
    if (!owner || owner !== caller) {
      return { ok: false, value: this.ERR_NOT_OWNER };
    }
    let versions = this.state.versions.get(tokenId) ?? [];
    if (version <= 0) {
      return { ok: false, value: this.ERR_INVALID_VERSION };
    }
    if (versions.length >= this.MAX_VERSIONS) {
      return { ok: false, value: this.ERR_ALREADY_UPDATED };
    }
    if (updatedUri.length === 0) {
      return { ok: false, value: this.ERR_INVALID_URI };
    }
    versions.push({ version, updatedUri, notes, timestamp: this.currentBlockHeight });
    this.state.versions.set(tokenId, versions);
    this.state.statuses.set(tokenId, {
      status: "version-added",
      lastUpdated: this.currentBlockHeight,
    });
    this.incrementBlockHeight();
    return { ok: true, value: true };
  }

  grantLicense(caller: string, tokenId: number, licensee: string, duration: number, terms: string): ClarityResponse<boolean> {
    if (this.state.paused) {
      return { ok: false, value: this.ERR_PAUSED };
    }
    const owner = this.state.owners.get(tokenId);
    if (!owner || owner !== caller) {
      return { ok: false, value: this.ERR_NOT_OWNER };
    }
    if (duration <= 0) {
      return { ok: false, value: this.ERR_INVALID_DURATION };
    }
    let licenses = this.state.licenses.get(tokenId) ?? [];
    licenses.push({
      licensee,
      expiry: this.currentBlockHeight + duration,
      terms,
      active: true,
    });
    this.state.licenses.set(tokenId, licenses);
    this.state.statuses.set(tokenId, {
      status: "license-granted",
      lastUpdated: this.currentBlockHeight,
    });
    this.incrementBlockHeight();
    return { ok: true, value: true };
  }

  revokeLicense(caller: string, tokenId: number, licensee: string): ClarityResponse<boolean> {
    if (this.state.paused) {
      return { ok: false, value: this.ERR_PAUSED };
    }
    const owner = this.state.owners.get(tokenId);
    if (!owner || owner !== caller) {
      return { ok: false, value: this.ERR_NOT_OWNER };
    }
    let licenses = this.state.licenses.get(tokenId) ?? [];
    licenses = licenses.filter(lic => lic.licensee !== licensee);
    this.state.licenses.set(tokenId, licenses);
    this.state.statuses.set(tokenId, {
      status: "license-revoked",
      lastUpdated: this.currentBlockHeight,
    });
    this.incrementBlockHeight();
    return { ok: true, value: true };
  }

  addCollaborator(caller: string, tokenId: number, collaborator: string, role: string, permissions: string[]): ClarityResponse<boolean> {
    if (this.state.paused) {
      return { ok: false, value: this.ERR_PAUSED };
    }
    const owner = this.state.owners.get(tokenId);
    if (!owner || owner !== caller) {
      return { ok: false, value: this.ERR_NOT_OWNER };
    }
    let collabs = this.state.collaborators.get(tokenId) ?? [];
    collabs.push({
      collaborator,
      role,
      permissions,
      addedAt: this.currentBlockHeight,
    });
    this.state.collaborators.set(tokenId, collabs);
    this.state.statuses.set(tokenId, {
      status: "collaborator-added",
      lastUpdated: this.currentBlockHeight,
    });
    this.incrementBlockHeight();
    return { ok: true, value: true };
  }

  lockToken(caller: string, tokenId: number): ClarityResponse<boolean> {
    if (this.state.paused) {
      return { ok: false, value: this.ERR_PAUSED };
    }
    const owner = this.state.owners.get(tokenId);
    if (!owner || owner !== caller) {
      return { ok: false, value: this.ERR_NOT_OWNER };
    }
    let metadata = this.state.metadata.get(tokenId);
    if (!metadata || metadata.locked) {
      return { ok: false, value: metadata ? this.ERR_TOKEN_LOCKED : this.ERR_TOKEN_NOT_FOUND };
    }
    metadata = { ...metadata, locked: true };
    this.state.metadata.set(tokenId, metadata);
    this.state.statuses.set(tokenId, {
      status: "locked",
      lastUpdated: this.currentBlockHeight,
    });
    this.incrementBlockHeight();
    return { ok: true, value: true };
  }

  unlockToken(caller: string, tokenId: number): ClarityResponse<boolean> {
    if (this.state.paused) {
      return { ok: false, value: this.ERR_PAUSED };
    }
    const owner = this.state.owners.get(tokenId);
    if (!owner || owner !== caller) {
      return { ok: false, value: this.ERR_NOT_OWNER };
    }
    let metadata = this.state.metadata.get(tokenId);
    if (!metadata || !metadata.locked) {
      return { ok: false, value: metadata ? this.ERR_TOKEN_LOCKED : this.ERR_TOKEN_NOT_FOUND };
    }
    metadata = { ...metadata, locked: false };
    this.state.metadata.set(tokenId, metadata);
    this.state.statuses.set(tokenId, {
      status: "unlocked",
      lastUpdated: this.currentBlockHeight,
    });
    this.incrementBlockHeight();
    return { ok: true, value: true };
  }

  getLastTokenId(): ClarityResponse<number> {
    return { ok: true, value: this.state.lastTokenId };
  }

  getTokenUri(tokenId: number): ClarityResponse<string | undefined> {
    const metadata = this.state.metadata.get(tokenId);
    return { ok: true, value: metadata?.uri };
  }

  getOwner(tokenId: number): ClarityResponse<string | undefined> {
    return { ok: true, value: this.state.owners.get(tokenId) };
  }

  getMetadata(tokenId: number): ClarityResponse<TokenMetadata | undefined> {
    return { ok: true, value: this.state.metadata.get(tokenId) };
  }

  getVersions(tokenId: number): ClarityResponse<TokenVersion[] | undefined> {
    return { ok: true, value: this.state.versions.get(tokenId) };
  }

  getStatus(tokenId: number): ClarityResponse<TokenStatus | undefined> {
    return { ok: true, value: this.state.statuses.get(tokenId) };
  }

  getLicenses(tokenId: number): ClarityResponse<TokenLicense[] | undefined> {
    return { ok: true, value: this.state.licenses.get(tokenId) };
  }

  getCollaborators(tokenId: number): ClarityResponse<Collaborator[] | undefined> {
    return { ok: true, value: this.state.collaborators.get(tokenId) };
  }

  isLocked(tokenId: number): ClarityResponse<boolean> {
    const metadata = this.state.metadata.get(tokenId);
    return { ok: true, value: metadata?.locked ?? false };
  }

  isLicenseActive(tokenId: number, licensee: string): ClarityResponse<boolean> {
    const licenses = this.state.licenses.get(tokenId) ?? [];
    const active = licenses.some(
      lic => lic.licensee === licensee && lic.active && lic.expiry >= this.currentBlockHeight
    );
    return { ok: true, value: active };
  }

  isPaused(): ClarityResponse<boolean> {
    return { ok: true, value: this.state.paused };
  }

  getContractOwner(): ClarityResponse<string> {
    return { ok: true, value: this.state.contractOwner };
  }
}

// Test setup
const accounts = {
  deployer: "deployer",
  org1: "org1",
  org2: "org2",
  unverified: "unverified_org",
};

describe("SupplyNFT Contract", () => {
  let contract: SupplyNFTMock;

  beforeEach(() => {
    contract = new SupplyNFTMock();
    vi.resetAllMocks();
  });

  it("should initialize correctly", () => {
    expect(contract.getLastTokenId()).toEqual({ ok: true, value: 0 });
    expect(contract.isPaused()).toEqual({ ok: true, value: false });
    expect(contract.getContractOwner()).toEqual({ ok: true, value: "deployer" });
  });

  it("should allow admin to pause and unpause", () => {
    let pauseResult = contract.pause(accounts.deployer);
    expect(pauseResult).toEqual({ ok: true, value: true });
    expect(contract.isPaused()).toEqual({ ok: true, value: true });

    let mintDuringPause = contract.mint(
      accounts.org1,
      accounts.org2,
      "uri",
      "blankets",
      100,
      null,
      "desc",
      []
    );
    expect(mintDuringPause).toEqual({ ok: false, value: 117 });

    let unpauseResult = contract.unpause(accounts.deployer);
    expect(unpauseResult).toEqual({ ok: true, value: true });
    expect(contract.isPaused()).toEqual({ ok: true, value: false });
  });

  it("should prevent non-admin from pausing", () => {
    let pauseResult = contract.pause(accounts.org1);
    expect(pauseResult).toEqual({ ok: false, value: 118 });
  });

  it("should mint new token with metadata", () => {
    const mintResult = contract.mint(
      accounts.org1,
      accounts.org2,
      "test-uri",
      "blankets",
      100,
      1000,
      "Test description",
      ["tag1", "tag2"]
    );
    expect(mintResult).toEqual({ ok: true, value: 1 });

    const owner = contract.getOwner(1);
    expect(owner).toEqual({ ok: true, value: accounts.org2 });

    const metadata = contract.getMetadata(1);
    expect(metadata).toEqual({
      ok: true,
      value: expect.objectContaining({
        uri: "test-uri",
        supplyType: "blankets",
        quantity: 100,
        expiration: 1000,
        description: "Test description",
        tags: ["tag1", "tag2"],
        locked: false,
      }),
    });

    const status = contract.getStatus(1);
    expect(status).toEqual({
      ok: true,
      value: expect.objectContaining({ status: "minted" }),
    });
  });

  it("should prevent mint with invalid data", () => {
    let invalidUri = contract.mint(
      accounts.org1,
      accounts.org2,
      "",
      "blankets",
      100,
      null,
      "desc",
      []
    );
    expect(invalidUri).toEqual({ ok: false, value: 102 });

    let invalidQuantity = contract.mint(
      accounts.org1,
      accounts.org2,
      "uri",
      "blankets",
      0,
      null,
      "desc",
      []
    );
    expect(invalidQuantity).toEqual({ ok: false, value: 106 });

    let tooLongDesc = contract.mint(
      accounts.org1,
      accounts.org2,
      "uri",
      "blankets",
      100,
      null,
      "a".repeat(501),
      []
    );
    expect(tooLongDesc).toEqual({ ok: false, value: 103 });

    let tooManyTags = contract.mint(
      accounts.org1,
      accounts.org2,
      "uri",
      "blankets",
      100,
      null,
      "desc",
      Array(11).fill("tag")
    );
    expect(tooManyTags).toEqual({ ok: false, value: 112 });

    let unverifiedMint = contract.mint(
      accounts.unverified,
      accounts.org2,
      "uri",
      "blankets",
      100,
      null,
      "desc",
      []
    );
    expect(unverifiedMint).toEqual({ ok: false, value: 113 });
  });

  it("should transfer token", () => {
    contract.mint(
      accounts.org1,
      accounts.org1,
      "uri",
      "blankets",
      100,
      null,
      "desc",
      []
    );

    const transferResult = contract.transfer(accounts.org1, 1, accounts.org1, accounts.org2);
    expect(transferResult).toEqual({ ok: true, value: true });

    const newOwner = contract.getOwner(1);
    expect(newOwner).toEqual({ ok: true, value: accounts.org2 });

    const status = contract.getStatus(1);
    expect(status).toEqual({
      ok: true,
      value: expect.objectContaining({ status: "transferred" }),
    });
  });

  it("should prevent invalid transfers", () => {
    // Mint a token for testing
    contract.mint(
      accounts.org1,
      accounts.org1,
      "uri",
      "blankets",
      100,
      null,
      "desc",
      []
    );

    // Test transfer by non-owner
    let wrongOwner = contract.transfer(accounts.org2, 1, accounts.org2, accounts.org2);
    expect(wrongOwner).toEqual({ ok: false, value: 100 });

    // Lock the token and test transfer
    contract.lockToken(accounts.org1, 1);
    let lockedTransfer = contract.transfer(accounts.org1, 1, accounts.org1, accounts.org2);
    expect(lockedTransfer).toEqual({ ok: false, value: 108 });

    // Unlock the token for invalid recipient test
    contract.unlockToken(accounts.org1, 1);
    let invalidRecipient = contract.transfer(accounts.org1, 1, accounts.org1, "invalid");
    expect(invalidRecipient).toEqual({ ok: false, value: 109 });
  });

  it("should burn token", () => {
    contract.mint(
      accounts.org1,
      accounts.org1,
      "uri",
      "blankets",
      100,
      null,
      "desc",
      []
    );

    const burnResult = contract.burn(accounts.org1, 1);
    expect(burnResult).toEqual({ ok: true, value: true });

    const owner = contract.getOwner(1);
    expect(owner).toEqual({ ok: true, value: undefined });

    const metadata = contract.getMetadata(1);
    expect(metadata).toEqual({ ok: true, value: undefined });
  });

  it("should update metadata", () => {
    contract.mint(
      accounts.org1,
      accounts.org1,
      "old-uri",
      "blankets",
      100,
      null,
      "old-desc",
      []
    );

    const updateResult = contract.updateMetadata(accounts.org1, 1, "new-uri", "new-desc");
    expect(updateResult).toEqual({ ok: true, value: true });

    const metadata = contract.getMetadata(1);
    expect(metadata).toEqual({
      ok: true,
      value: expect.objectContaining({
        uri: "new-uri",
        description: "new-desc",
      }),
    });

    const status = contract.getStatus(1);
    expect(status).toEqual({
      ok: true,
      value: expect.objectContaining({ status: "metadata-updated" }),
    });
  });

  it("should add version", () => {
    contract.mint(
      accounts.org1,
      accounts.org1,
      "uri",
      "blankets",
      100,
      null,
      "desc",
      []
    );

    const addVersionResult = contract.addVersion(accounts.org1, 1, 1, "updated-uri", "notes");
    expect(addVersionResult).toEqual({ ok: true, value: true });

    const versions = contract.getVersions(1);
    expect(versions).toEqual({
      ok: true,
      value: expect.arrayContaining([
        expect.objectContaining({ version: 1, updatedUri: "updated-uri", notes: "notes" }),
      ]),
    });

    const status = contract.getStatus(1);
    expect(status).toEqual({
      ok: true,
      value: expect.objectContaining({ status: "version-added" }),
    });
  });

  it("should prevent adding too many versions", () => {
    contract.mint(
      accounts.org1,
      accounts.org1,
      "uri",
      "blankets",
      100,
      null,
      "desc",
      []
    );

    for (let i = 1; i <= 5; i++) {
      contract.addVersion(accounts.org1, 1, i, "uri" + i, "notes" + i);
    }

    const tooMany = contract.addVersion(accounts.org1, 1, 6, "uri6", "notes6");
    expect(tooMany).toEqual({ ok: false, value: 115 });
  });

  it("should grant and revoke license", () => {
    contract.mint(
      accounts.org1,
      accounts.org1,
      "uri",
      "blankets",
      100,
      null,
      "desc",
      []
    );

    const grantResult = contract.grantLicense(accounts.org1, 1, accounts.org2, 100, "terms");
    expect(grantResult).toEqual({ ok: true, value: true });

    let isActive = contract.isLicenseActive(1, accounts.org2);
    expect(isActive).toEqual({ ok: true, value: true });

    const status = contract.getStatus(1);
    expect(status).toEqual({
      ok: true,
      value: expect.objectContaining({ status: "license-granted" }),
    });

    const revokeResult = contract.revokeLicense(accounts.org1, 1, accounts.org2);
    expect(revokeResult).toEqual({ ok: true, value: true });

    isActive = contract.isLicenseActive(1, accounts.org2);
    expect(isActive).toEqual({ ok: true, value: false });
  });

  it("should add collaborator", () => {
    contract.mint(
      accounts.org1,
      accounts.org1,
      "uri",
      "blankets",
      100,
      null,
      "desc",
      []
    );

    const addCollabResult = contract.addCollaborator(accounts.org1, 1, accounts.org2, "role", ["perm1", "perm2"]);
    expect(addCollabResult).toEqual({ ok: true, value: true });

    const collabs = contract.getCollaborators(1);
    expect(collabs).toEqual({
      ok: true,
      value: expect.arrayContaining([
        expect.objectContaining({ collaborator: accounts.org2, role: "role", permissions: ["perm1", "perm2"] }),
      ]),
    });

    const status = contract.getStatus(1);
    expect(status).toEqual({
      ok: true,
      value: expect.objectContaining({ status: "collaborator-added" }),
    });
  });

  it("should lock and unlock token", () => {
    contract.mint(
      accounts.org1,
      accounts.org1,
      "uri",
      "blankets",
      100,
      null,
      "desc",
      []
    );

    const lockResult = contract.lockToken(accounts.org1, 1);
    expect(lockResult).toEqual({ ok: true, value: true });

    let isLocked = contract.isLocked(1);
    expect(isLocked).toEqual({ ok: true, value: true });

    const status = contract.getStatus(1);
    expect(status).toEqual({
      ok: true,
      value: expect.objectContaining({ status: "locked" }),
    });

    const unlockResult = contract.unlockToken(accounts.org1, 1);
    expect(unlockResult).toEqual({ ok: true, value: true });

    isLocked = contract.isLocked(1);
    expect(isLocked).toEqual({ ok: true, value: false });
  });
});