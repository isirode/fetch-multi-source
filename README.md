# fetch-multi-source

This is a library allowing to fetch a resource (as an Uint8Array) from multiple sources.

The sources can be:
- a fetch wrapper (like [fetch-progress](https://github.com/isirode/fetch-progress))
- another type of source, as long as the interface is respected

The resources are fetch pieces by piece, and a hash comparison is made for each parts.

If a resource hash is provided, it is compared as well.

## Features

- [x] Fetch from multiple fetch sources
- [x] Other type of sources
  - As long as the interface is respected

- [x] Emit onPieceFailed events
- [x] Emit onPieceDone events
- [x] Emit onDone events
- [x] Emit onFailed events

- [x] Similar API as the original fetch API
  - I am using a class instead of a method
  - The returned value is a Uint8Array

## Using the library

```typescript
import { Events, FetchMultiSource } from "fetch-multi-source";

async function main() {
  const filename = 'https://your-resource';

  const fetchProgress1: FetchProgress = new FetchProgress();
  const fetchProgress2: FetchProgress = new FetchProgress();

  const fetchMultiSource: FetchMultiSource = new FetchMultiSource(resourceInfo, {
    maxParallelism: 5,
    interval: 100,
    fetchers: [
      fetchProgress1, fetchProgress2
    ]
  });

  let lastProgressPerCent: number = 0; 
  fetchMultiSource.events.on('onPieceDone', ({fetchMultiSource}) => {
    const progressInPerCent = fetchMultiSource.donePieces.length / fetchMultiSource.resourceInfo.pieces.length * 100;
    if (progressInPerCent >= lastProgressPerCent + 10) {
      console.log(progressInPerCent.toFixed() + ' %');
      lastProgressPerCent += 10;
    }
  });
  fetchMultiSource.events.on('onPieceFailed', ({piece}) => {
    console.error(`piece ${piece.index} failed (fail count: ${piece.failureCount})`);
  });
  fetchMultiSource.events.on('onFailed', (onFailedData) => {
    console.error(`fetch failed`, onFailedData);
  });

  const arrayFile = await fetchMultiSource.fetch(filename);
  
  console.log(`array file size ${arrayFile.length}`);

  // You can use the data here
  // let utf8decoder = new TextDecoder();
  // console.log('data:');
  // console.log(utf8decoder.decode(arrayFile));
}

main();
```

## Importing the project

It is not published yet, so you will need to follow the steps below:
- Clone the project
- Build it `npm run build`
- Link it `npm link`
- Or use the single liner `npm run local`
- Then, you can import it in your project using `npm link fetch-multi-source`

Or, use the published package on Github, for instance:
- In the dependencies field of the package.json of your project, put, for the version 1.0.0:
  - "fetch-multi-source": "https://github.com/isirode/fetch-multi-source/releases/download/1.0.0/fetch-multi-source-1.0.0.tgz"

So that it looks like this:

```json
{
  ...
  "dependencies": {
    ...
    "fetch-progress": "https://github.com/isirode/fetch-multi-source/releases/download/1.0.0/fetch-multi-source-1.0.0.tgz",
    ...
  }
  ...
}
```

### Dependencies

You should not need to do any custom imports.

## Know issues

Nothing here, yet.

## Partipating

Open the [DEVELOPER.md](./DEVELOPER.md) section.

## License

It is provided with the GNU LESSER GENERAL PUBLIC LICENSE.

This is a library allowing to fetch a resource from multiple sources.
Copyright (C) 2023  Isirode

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <https://www.gnu.org/licenses/>.
