# Invidious Switcher

Invidious Switcher is a node.js module that automatically monitors Invidious instances and routes your requests through the best instance automatically.

## Beta!

Invidious Switcher is currently in beta. Once it is stable, the version will be increased to 1.0.0 and this notice will be removed. During this beta period, please report absolutely any weirdness, bugs, or feature requests. You can open a GitHub issue here (preferred), or talk to me on another service: https://cadence.moe/about/contact

## Features

- Simple methods provided for Invidious API endpoints
- Automatically routes requests through the best instance
- If an instance fails, the request will automatically be routed to a different instance
- Can automatically obtain an instance list from https://instances.invidio.us
- Can periodically monitor instances for availability (this is more advanced then instances/"health" — it actually checks if the instance is blocked)
- Beautiful logging
- Extremely customisable

## Installation

`npm install cloudrac3r/invidious-switcher`

If you're currently looking at a fork, be sure to use the forker's username instead of `cloudrac3r`!

## Usage

    const {Switcher} = require("invidious-switcher")
    const switcher = new Switcher("/path/to/config.json")
    await switcher.waitForReady()
    Promise.all([
        switcher.requestVideo("dQw4w9WgXcQ"),
        switcher.requestChannel("UC38IQsAvIsxxjztdMZQtwHA"),
        switcher.requestChannelVideos("UC38IQsAvIsxxjztdMZQtwHA"),
        switcher.requestChannelLatest("UC38IQsAvIsxxjztdMZQtwHA")
    ]).then(([video, channel, videos, latest]) => {
        // :)
    })

## Future plans

In the future I plan to turn this into an (optional) client/server architecture to centralise tracking in order to reduce load on instances. The server would do the actual tracking, and clients would just request the server's data without doing any tracking requests of their own.

# Documentation

Remember, just because something is written here, doesn't mean that you should use it, or even that it makes sense to use it.

If you think there might be several ways of doing something, the one closer to the top is probably more sensible.

Methods and properties that you _probably shouldn't fiddle with_ are prefixed with a \* in this documentation.

## Exports

    const {Switcher, Tracker, Instance, Config} = require("invidious-switcher")

These are the different classes that make up invidious-switcher. You will normally only need to access Switcher.

## Config

Config is created by Switcher and manages settings for all the linked parts of invidious-switcher.

Config takes a filename to read settings from. If you do not provide a filename, it will read from `/config.json`. This file can contain single-line comments, which are stripped as the contents are read.

All documentation of the contents of the config file is in these comments. Open the file and take a look.

When passed a different filename, the settings are entirely replaced with the contents of that file, rather than merged with the defaults! Therefore, when using your own config, you must supply a complete file. You cannot supply a partial file to override the defaults.

It is likely that you will want to use some different settings. Even if you like the defaults, `/config.json` in this repo will change in later versions. This could cause unexpected behaviour in your application. Therefore, you should create and use your own config file whenever you use invidious-switcher.

**Please copy `/config.json` from this repo into your application, modify it as needed, and load it from Switcher.**

Some suggested config files for specific use cases are available in the `/suggested_configs` folder. If you would like to use a suggested config, simply copy it into your application as normal.

## Switcher

Switcher provides convenient access to the Invidious API. Your application will probably interact with this class the most.

After calling the constructor, Switcher must send some requests before it is usable. You can wait for it to be usable by either listening for the `.events:ready` event (will only be emitted once!), or by waiting for the promise returned by `.waitForReady()`.

### constructor(config): Switcher

config:
- (missing): use the default config
- string: a filename to read the config from
- Config: a premade Config object to use

### waitForReady(): Promise

Returns a promise that resolves when the switcher is ready.

### requestVideo(id: string): Promise\<data\>

Request data from /api/v1/videos/{id}

This, and all the other `request` methods, will intelligently try instances one by one until one works, and then resolve with valid data. If all instances fail, the promise will reject.

### requestChannel(id: string): Promise\<data\>

Request data from /api/v1/channels/{id}

### requestChannelVideos(id: string): Promise\<data\>

Request data from /api/v1/channels/{id}/videos

### requestChannelLatest(id: string): Promise\<data\>

Request data from /api/v1/videos/{id}/latest

### properties

- ready: boolean  
Whether the switcher is ready
- events: EventEmitter
- config: Config
- logger: Logger
- tracker: Tracker

## Tracker

Load, track, and select instances.

### constructor({config, logger}): Tracker

### getInstance(site: string): Instance

Return a created instance from the internal store.

### getNextInstance(): Instance

Use all of the config settings to get the most suitable instance to use next.

### getWorkingInstances(): Instance[]

Returns a list of all instances that are currently detected as working.

### getFastestInstance(): Instance

Out of all working instances, return the instance that is currently detected to respond the fastest. However, depending on your config settings, this may not be the most suitable instance to use next. Use `.getNextInstance()` to get the most suitable instance.

### checkAll(): Promise

Force a recheck of all instances.

### checkRecommended(): Promise

Force a recheck of a selection of instances as specified in the config.

### \*init(): Promise

Called automatically by the constructor. Fetches the instance list, checks all instances once, then emits `.events:ready`.

### \*loadConfig()

Called automatically by `.init`. Reads the instance list from config and adds each site to the internal instance store.

### \*loadRemote(): Promise

Called automatically by `.init`. Loads and imports data from the instance list fetch URL.


### properties

- config: Config
- logger: Logger
- events: EventEmitter
- interval: Interval
- currentlyChecking: boolean
- lastInstance: Instance
- \*instances: Map\<string, Instance\>

## Instance

Represents a single instance and its uptime history, and provides methods to retrieve that data as well as add to it by requesting from the instance.

Certain errors are detected as errors that won't be fixed in the future. For example, the `/api/v1/videos/{id}` endpoint on an instance being deliberately disabled. When these errors are encountered, the kind of request will be added to the instance's `.blacklistedKinds`. Future method calls for the same kind will reject without sending a request.

### constructor({config, logger}, site: string, options: {}): Instance

All options properties are optional.

site: the instance origin URL, for example `https://invidio.us` or `http://localhost:3000`

options:
- available: boolean  
Set false and the instance will report not working without making any automatic requests or adding history records. Calling a request method directly still works like normal.
- trackingMethod: string
A tracking method override for this instance: `home`, `stats`, `channel` or `video`.
- useCookies: boolean
Enable an isolated cookie jar for this instance.
- headers: object
Custom key-value headers for requests sent for this instance.

### isWorking(): boolean

### shouldTryToSave(): boolean

Is this instance "available" and offline? This function is called by Tracker to determine whether to check an instance or not.

### getAverageTime(): number

### check(): Promise\<boolean\>

Call a more specific check method depending on the global and instance method settings. None of these check methods should reject.

### checkHome(): Promise\<boolean\>

Request /feed/trending, detect errors, add to history, return whether it was successful.

### getVersionFromHome(): Promise\<string\>

Request /feed/trending, get the current version from the footer, detect errors, add to history, return the version string. Problems are rejected.

### checkStats(): Promise\<boolean\>

Like `.checkHome` but for /api/v1/stats.

### requestVideo(id): Promise\<any\>

Request /api/v1/videos/{id} and resolve data or reject errors. A history entry is added.

### checkVideo(id): Promise\<boolean\>

Like `.requestVideo` but returns a boolean and never rejects.

### requestChannel(id): Promise\<any\>

Request /api/v1/channels/{id} and resolve data or reject errors. A history entry is added.

### checkChannel(id): Promise\<boolean\>

Like `.requestChannel` but returns a boolean and never rejects.

### requestChannelVideos(id): Promise\<any\>

Request /api/v1/channels/{id}/videos and resolve data or reject errors. A history entry is added.

### requestChannelLatest(id): Promise\<any\>

Request /api/v1/channels/{id}/latest and resolve data or reject errors. A history entry is added.

### \*makeAPIRequest(kind: string, endpoint: string): Promise\<any\>

Make a request to the instance API, detect errors, add a history entry, and return the result. This is used by other methods.

### \*_makeTimedRequest(endpoint: string, options: object): Promise\<[number, any]\>

### \*_makeTimedCookieRequest(endpoint: string, options: object): Promise\<[number, any]\>

### \*_addRecord(method: string, working: boolean, time: number)

### \* (static) normaliseConfig(data: any): [string, object]

### properties

- config: Config
- logger: Logger
- site: string  
The instance origin, e.g. `https://invidio.us` or `http://localhost:3000`
- options: object
- jar: CookieJar
- events: EventEmitter
- blacklistedKinds: Set
- available: boolean
- records: object[]