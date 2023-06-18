# Developer

## Participating

You can post an issue or you can open a PR, if there is a functionality that you think will be relevant to the project.

Your code will be posted using the same license as this project.

## Running tests

> npm test

Or

> yarn test

## Build

> npm run build

Or

> yarn build

## Debugging

The tests are executed inside a temporary browser, so it might be difficult to debug.

### browser.debug()

The tests have `await browser.debug()` line in there catch part.

You can also put it at the beginning of a test, if you want to debug from the start.

You will need to prompt `.exit` or `CTRL+C` in the IDE, after setting up the break points.

### watch

You can use the `wdio-watch` commands to keep the browser open, aswell.

### launch.json

It is supposed to be working, but it is not.

I am not using [VSCode Nightly](https://webdriver.io/docs/debugging/) though.

## Features

- [x] Fetch from multiple fetch sources
- [x] Other type of sources
  - As long as the interface is respected

- [ ] Events
  - [x] onPieceDone
  - [x] onPieceFailed
  - [ ] onPieceProgress
  - [x] onDone
  - [x] onFailed

- [ ] Piece
  - [ ] Stop attempting a piece

- [ ] Fetcher
  - [ ] Exclude a fetcher

- [ ] Cancellation

- [ ] Resource info
  - [x] Hash algorithm
  - [x] Piece hash algorithm
    - Default to hash algorithm if not present

- [ ] Configuration

## TODO

- Implement an hash system
- Provide diverse implementation of fetch
  - fetch and rename hostname
  - fetch by having the hostname as a 

## Design

- What API should be followed ?
  - Same as fetch ?
  - Return value is different
