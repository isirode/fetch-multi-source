import Emittery from "emittery";
import { Events, FetchMultiSource, Piece, ResourceInfo } from "../../src/domain/FetchMultiSource";
import { expect } from 'chai';
import parseTorrent, { remote } from "parse-torrent";
import { Instance } from "parse-torrent-file";
import { FetchProgress} from 'fetch-progress';
import { browser, $, $$, expect as wdioExpect } from '@wdio/globals';
import pWaitFor from 'p-wait-for';
import { Buffer } from 'buffer/';
import { ConsoleAppender, IConfiguration, Level, LogManager, LoggerFactory, PupaLayout } from "log4j2-typescript";

// For HTTP, port is 5100
const filename = 'https://static.isirode.ovh/public/word-guessing/dictionaries/grammalecte/db-fra-grammalecte-1.0.0.db';
const torrentFilename = 'https://static.isirode.ovh/dorrent/word-guessing/dictionaries/grammalecte/db-fra-grammalecte-1.0.0.db.dorrent';

// Info : you will need to display the verbose logs in the browser's debugger if you want to see the FetchProgress's logs
// Since they are of debug level
const logConfiguration: IConfiguration = {
  appenders: [
    new ConsoleAppender("console", new PupaLayout("{loggerName} {level} {time} {message}"))
  ],
  loggers: [
    {
      name: "com.isirode.",
      level: Level.INFO,
      refs: [
        {
          ref: "console"
        },
      ]
    }
  ]
}

const logManager: LogManager = new LogManager(logConfiguration);

describe('FetchProgress', () => {

  describe('donePiecesOrdered', () => {

    it('it should be ordered', async () => {
      // given
      const piece0: Piece = {
        index: 0,
        failureCount: 0
      }
      const piece1: Piece = {
        index: 1,
        failureCount: 0
      }
      const piece2: Piece = {
        index: 2,
        failureCount: 0
      }
      const fetchProgress1: FetchProgress = new FetchProgress();
      const fetchProgress2: FetchProgress = new FetchProgress();
      const resourceInfo: ResourceInfo = {
        hash: '',
        length: 1,
        pieceLength: 1,
        lastPieceLength: 1,
        pieces: [],
        hashAlgorithm: 'SHA-1'
      };

      const fetchMultiSource: FetchMultiSource = new FetchMultiSource(resourceInfo, {
        maxParallelism: 5,
        fetchers: [
          fetchProgress1, fetchProgress2
        ]
      });
      fetchMultiSource.donePieces.push(piece1, piece2, piece0);

      // when
      const orderedPieces = fetchMultiSource.donePiecesOrdered;

      // then
      expect(orderedPieces.length).to.be.equal(fetchMultiSource.donePieces.length);
      expect(orderedPieces).to.be.eql([piece0, piece1, piece2]);
    });
  });

  describe('fetch', () => {

    const logger = LoggerFactory.getLogger('com.isirode.fetch-multi-source.spec');

    let resourceInfo: ResourceInfo;

    before(async () => {
      try {
        // Not working by itself
        // Other methods are not working as well (Buffer error was not there, only the path.join error)
        // ReferenceError: Buffer is not defined
        // https://github.com/webdriverio/webdriverio/tree/main/packages/wdio-browser-runner is using Vite
        // It seem that there are alternatives to browserify but it does not look simple
        // Solution : import Buffer and path from polyfills
        const response = await fetch(torrentFilename);
        if (response.status !== 200) {
          throw new Error(`an error occurred : ${response.status}:${response.statusText}`)
        }
        const body = await response.blob();
        // await browser.debug();
        const dorrent = await parseTorrent(new Buffer(await body.arrayBuffer())) as Instance;

        logger.info('dorrent:', dorrent);

        if (!dorrent) {
          logger.error(`dorrent is undefined`);
          throw new Error(`dorrent is undefined`);
        }

        // console.log(dorrent);
    
        if (dorrent.infoHash === undefined) {
          throw new Error(`dorrent infoHash is undefined`);
        }
        if (dorrent.length === undefined) {
          throw new Error(`dorrent length is undefined`);
        }
        if (dorrent.pieceLength === undefined) {
          throw new Error(`dorrent pieceLength is undefined`);
        }
        if (dorrent.lastPieceLength === undefined) {
          throw new Error(`dorrent pieceLength is undefined`);
        }
        if (dorrent.pieces === undefined) {
          throw new Error(`dorrent pieces is undefined`);
        }
    
        resourceInfo = {
          length: dorrent.length,
          // Info : infoHash is not the hash of the torrent's data
          // Also, there is no hash per files
          // hash: dorrent.infoHash,
          pieceLength: dorrent.pieceLength,
          lastPieceLength: dorrent.lastPieceLength,
          pieces: dorrent.pieces,
          hashAlgorithm: 'SHA-1'
        }
      } catch (err: unknown) {
        logger.error('an error occurred in the browser', {}, err as Error);
        browser.debug();
        throw err;
      }
    });

    it('should fetch the file', async () => {
      // given
      const expectedFileSize = 80740352;

      // when
      try {
        const fetchProgress1: FetchProgress = new FetchProgress();
        const fetchProgress2: FetchProgress = new FetchProgress();
        const fetchProgress3: FetchProgress = new FetchProgress();
        const fetchProgress4: FetchProgress = new FetchProgress();
        const fetchProgress5: FetchProgress = new FetchProgress();

        const fetchMultiSource: FetchMultiSource = new FetchMultiSource(resourceInfo, {
          maxParallelism: 5,
          interval: 100,
          fetchers: [
            fetchProgress1, fetchProgress2, fetchProgress3, fetchProgress4, fetchProgress5
          ]
        });

        // TODO : include it in the project
        let lastProgressPerCent: number = 0; 
        fetchMultiSource.events.on('onPieceDone', ({fetchMultiSource}) => {
          const progressInPerCent = fetchMultiSource.donePieces.length / fetchMultiSource.resourceInfo.pieces.length * 100;
          if (progressInPerCent >= lastProgressPerCent + 10) {
            logger.info(progressInPerCent.toFixed() + ' %');
            lastProgressPerCent += 10;
          }
        });
        fetchMultiSource.events.on('onPieceFailed', ({piece}) => {
          logger.error(`piece ${piece.index} failed (fail count: ${piece.failureCount})`);
        });
        fetchMultiSource.events.on('onFailed', (onFailedData) => {
          logger.error(`fetch failed`, onFailedData);
        });

        const response = await fetchMultiSource.fetch(filename);

        // then
        expect(response.data!.length).to.be.equal(expectedFileSize);
        expect(response.data!.length).to.be.equal(resourceInfo.length);
      } catch (err: unknown) {
        console.log('an error occurred in the browser', err);
        await browser.debug();
        throw err;
      }
    });
  });
});
