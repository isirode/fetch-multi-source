import Emittery from 'emittery';
import { ILogger, LoggerFactory } from 'log4j2-typescript';
import pWaitFor from 'p-wait-for';

export interface IFetcher {
  fetch(input: RequestInfo | URL, init?: RequestInit | undefined): Promise<Uint8Array>;
}

export interface ResourceInfo {
  // Info : torrents do not have a 'data hash'
  hash?: string;
  hashAlgorithm:  AlgorithmIdentifier;
  pieceHashAlgorithm?: AlgorithmIdentifier;
  length: number;
  pieces: string[];
  pieceLength: number;
  lastPieceLength: number;
}

export interface Configuration {
  fetchers: IFetcher[];
  maxParallelism: number;
  timeout?: number;
  interval?: number;
}

export interface Piece {
  index: number;
  data?: Uint8Array;
  failureCount: number;
}

export interface OnPieceDoneData {
  resource: RequestInfo | URL;
  fetchMultiSource: FetchMultiSource;
  piece: Piece;
}

export enum PieceFailureReason {
  Error,
  BodySizeTooSmall,
  BodySizeTooBig,
  WrongHash
}

export interface OnPieceFailedData {
  resource: RequestInfo | URL;
  fetchMultiSource: FetchMultiSource;
  piece: Piece;
  failureReason: PieceFailureReason;
  error?: unknown;
}

export interface OnDoneData {
  resource: RequestInfo | URL;
  fetchMultiSource: FetchMultiSource;
  data: Uint8Array;
}

export enum ResourceFailureReason {
  Timeout,
  WrongHash,
  // TODO : implement this
  RunoutOfFetcher,
  // TODO : implement this
  // Should already throw an error if added into the RequestInit I think
  Cancelled
}

export interface OnFailedData {
  resource: RequestInfo | URL;
  fetchMultiSource: FetchMultiSource;
  reason: ResourceFailureReason;
  error?: Error;
}

export interface Events {
  onPieceDone: OnPieceDoneData;
  onPieceFailed: OnPieceFailedData;
  onDone: OnDoneData;
  onFailed: OnFailedData;
}

// TODO : invalidate a source
// TODO : exponential backoff

// Info : we are using one instance per resource for now
// That allow to keep the fetch API as similar as possible with other implementations
export class FetchMultiSource implements IFetcher {

  logger: ILogger = LoggerFactory.getLogger('com.isirode.fetch-multi-source');

  events: Emittery<Events> = new Emittery();

  resourceInfo: ResourceInfo;
  configuration: Configuration;

  availableFetchers: IFetcher[] = [];
  inProgressFetchers: IFetcher[] = [];

  awaitingPieces: Piece[] = [];
  donePieces: Piece[] = [];

  pieceHashAlgoritm: AlgorithmIdentifier;

  get donePiecesOrdered(): Piece[] {
    const reorderedPieces = this.donePieces.sort((a, b) => {
      return a.index - b.index;
    });
    return reorderedPieces;
  }

  constructor(resourceInfo: ResourceInfo, configuration: Configuration, events?: Emittery<Events>) {
    this.resourceInfo = resourceInfo;
    this.configuration = configuration;

    if (events) {
      this.events = events;
    }

    this.pieceHashAlgoritm = resourceInfo.pieceHashAlgorithm ?? resourceInfo.hashAlgorithm;

    this.availableFetchers.push(...this.configuration.fetchers);
    resourceInfo.pieces.forEach((value: string, index: number) => {
      this.awaitingPieces.push({
        index: index,
        failureCount: 0
      });
    });
  }

  async fetch(input: RequestInfo | URL, init?: RequestInit | undefined): Promise<Uint8Array> {
    const self = this;

    this.distributeWork(input, init);

    // TOOD : implement infinite timeout
    // Can use fallback as well
    const timeout = this.configuration.timeout ?? 60 * 60 * 1000;
    const interval = this.configuration.interval ?? 250;
    try {
      await pWaitFor(() => {
        if (self.donePieces.length === self.resourceInfo.pieces.length) {
          return true;
        }
  
        self.distributeWork(input, init);
  
        return false;
      }, {
        timeout: timeout,
        interval: interval,
      });
    } catch(error: unknown) {
      this.events.emit('onFailed', {
        resource: input,
        fetchMultiSource: this,
        reason: ResourceFailureReason.Timeout,
        error: error as Error
      });

      throw error;
    }

    if (this.inProgressFetchers.length !== 0) {
      this.logger.warn(`inProgressFetchers is not zero but ${this.inProgressFetchers.length}`);
    }

    const reorderedPieces = this.donePiecesOrdered;
    
    // FIXME : not indispensable in production
    if (reorderedPieces[0].index !== 0) {
      this.logger.warn(`first entry should be index 0 but is ${reorderedPieces[0].index}`);
    }

    let result = new Uint8Array(this.resourceInfo.length);
    reorderedPieces.forEach((piece) => {
      if (piece.data === undefined) {
        throw new Error(`piece ${piece.index} data is undefined after being put in done queue`);
      }
      result.set(piece.data, piece.index * self.resourceInfo.pieceLength);
    });

    if (this.resourceInfo.hash) {
      const hash = hashToString(await crypto.subtle.digest(this.resourceInfo.hashAlgorithm, result));

      if (hash !== this.resourceInfo.hash) {
        const error = new Error(`result hash is '${hash}' but '${this.resourceInfo.hash} was expected`);
  
        this.events.emit('onFailed', {
          resource: input,
          fetchMultiSource: this,
          reason: ResourceFailureReason.WrongHash,
          error: error
        });
  
        throw error;
      }
    }

    this.events.emit('onDone', {
      resource: input,
      fetchMultiSource: this,
      data: result
    });

    return result;
  }

  protected distributeWork(input: RequestInfo | URL, init?: RequestInit | undefined) {
    if (this.availableFetchers.length === 0) {
      return;
    }

    const self = this;

    let maxParallelism = Math.min(this.configuration.maxParallelism, this.configuration.fetchers.length) - this.inProgressFetchers.length;
    for (let i = 0; i < maxParallelism; i++) {
      const fetcher = this.availableFetchers.shift();
      if (fetcher === undefined) {
        this.logger.warn('fetcher is undefined, it should not happen');
        break;
      }
      const piece = this.awaitingPieces.shift();
      if (piece === undefined) {
        break;
      }
      this.inProgressFetchers.push(fetcher);
      let requestInit: RequestInit = init ?? {};
      const promise = this.fetchPiece(input, requestInit, fetcher, piece);
      promise.then(async (data) => {
        // TODO : try catch and handle properly
        piece.data = data;

        const expectedPieceLength = self.pieceLength(piece.index);

        if (data.length !== expectedPieceLength) {
          self.handleFetchPieceError(
            input,
            fetcher,
            piece,
            data.length < expectedPieceLength ? PieceFailureReason.BodySizeTooSmall : PieceFailureReason.BodySizeTooBig,
            new Error(`piece ${piece.index} data length (${data.length}) is not the expected length ${expectedPieceLength}`)
          );
          return;
        }

        const expectedHash = self.resourceInfo.pieces[piece.index];

        // TODO : allow to customize the algorithm
        const hash = hashToString(await crypto.subtle.digest(self.pieceHashAlgoritm, data));

        if (hash !== expectedHash) {
          console.log('data length', data.length);
          console.log('expected length', this.resourceInfo.length);
          console.log(data);
          self.handleFetchPieceError(
            input,
            fetcher,
            piece,
            PieceFailureReason.WrongHash,
            new Error(`piece ${piece.index} hash (${hash}) is not the expected hash $expectedHash}`)
          );
          return;
        }

        self.releaseFetcher(fetcher);

        self.donePieces.push(piece);

        self.events.emit('onPieceDone', {
          resource: input,
          fetchMultiSource: self,
          piece: piece
        });

      }, (error) => {
        self.handleFetchPieceError(input, fetcher, piece, PieceFailureReason.Error, error);
      });
    }
  }

  protected fetchPiece(input: RequestInfo | URL, init: RequestInit, fetcher: IFetcher, piece: Piece): Promise<Uint8Array> {
    const range: string = this.getRange(piece.index);
    init.headers = init.headers ?? {}
    init.headers['range' as keyof HeadersInit] = range;
    return fetcher.fetch(input, init);
  }

  protected getRange(index: number): string {
    const startRange = index * this.resourceInfo.pieceLength;

    const pieceLength = this.pieceLength(index);
    let endRange = startRange + pieceLength - 1;

    return `bytes=${startRange}-${endRange}`;
  }

  protected pieceLength(index: number) {
    if (index === this.resourceInfo.pieces.length - 1) {
      return this.resourceInfo.lastPieceLength;
    } else {
      return this.resourceInfo.pieceLength;
    }
  }

  protected handleFetchPieceError(input: RequestInfo | URL, fetcher: IFetcher, piece: Piece, reason: PieceFailureReason, error?: unknown) {
    this.logger.warn(`an error occurred while fetching piece ${piece.index}`);
    piece.failureCount += 1;

    this.releaseFetcher(fetcher);

    // FIXME : should we have a inProgress pieces array ?
    this.awaitingPieces.push(piece);

    // TODO : implement monitoring of fetcher here

    this.events.emit('onPieceFailed', {
      resource: input,
      fetchMultiSource: this,
      piece: piece,
      failureReason: reason,
      error: error
    });
  }

  protected releaseFetcher(fetcher: IFetcher) {
    const index = this.inProgressFetchers.findIndex((value) => {
      return value === fetcher;
    });
    if (index === -1) {
      this.logger.warn(`fetcher was not found in inProgressFetchers`, fetcher);
    } else {
      this.inProgressFetchers.splice(index, 1);
    }
    this.availableFetchers.push(fetcher);
  }

}

// From https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API/Non-cryptographic_uses_of_subtle_crypto
// Source: https://github.com/mdn/content/commits/main/files/en-us/web/api/web_crypto_api/non-cryptographic_uses_of_subtle_crypto/index.md
// License should be CC0 https://creativecommons.org/publicdomain/zero/1.0/
// Or MIT
function hashToString(arrayBuffer: ArrayBuffer) {
  const uint8View = new Uint8Array(arrayBuffer);
  return Array.from(uint8View)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}