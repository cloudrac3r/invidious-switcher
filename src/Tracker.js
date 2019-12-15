const semver = require("semver")
/** @type {import("wumpfetch").default} */
// @ts-ignore
const wumpfetch = require("wumpfetch")
const {EventEmitter} = require("events")
const Instance = require("./Instance")
require("./testimports")(Instance)

const minTrackInterval = 20000 // prevent people from setting silly low values in config

/**
 * Collects and selects instances.
 */
class Tracker {
	/**
	 * @param {object} input
	 * @param {import("./Config")} input.config
	 * @param {import("./Logger")} input.logger
	 */
	constructor({config, logger}) {
		this.config = config
		this.logger = logger
		this.events = new EventEmitter()

		this.interval = null
		this.currentlyChecking = false

		/** @type {Instance} */
		this.lastInstance = null

		/** @type {Map<string, Instance>} */
		this.instances = new Map()

		this.init()
	}

	async init() {
		this.loadConfig()
		if (this.config.settings.fetch.enabled) await this.loadRemote()
		if (this.config.settings.tracking.enabled) {
			if (this.config.settings.tracking.interval < minTrackInterval) throw new Error("Tracking interval from config must be greater than "+minTrackInterval)
			this.interval = setInterval(() => this.checkRecommended(), this.config.settings.tracking.interval)
			await this.checkAll()
		}
		this.events.emit("ready")
	}

	getInstance(site) {
		return this.instances.get(site)
	}

	_createInstance(site, options) {
		if (!this.instances.has(site)) {
			const instance = new Instance({logger: this.logger, config: this.config}, site, options)
			this.instances.set(site, instance)
			return instance
		} else {
			return this.instances.get(site)
		}
	}

	loadConfig() {
		this.config.settings.instances.forEach(data => {
			const [site, options] = Instance.normaliseConfig(data)
			if (!this.instances.has(site)) this._createInstance(site, options)
		})
		this.logger.log("info", "load ", `Loaded ${this.config.settings.instances.length} instances from settings`)
	}

	loadRemote() {
		return wumpfetch(this.config.settings.fetch.url).send().then(async res => {
			if (res.statusCode !== 200) throw new Error("Status code "+res.statusCode)
			const data = res.json()
			if (!Array.isArray(data)) throw new Error("Unexpected response: level 1 is not array")
			let loadedCount = 0
			await Promise.all(data.map(async instance => {
				if (!Array.isArray(instance)) throw new Error("Unexpected response: level 2 is not array")
				const info = instance[1]
				if (info.type !== "https") return // we can only use https instances
				if (this.config.settings.fetch.ignoreDead && info.monitor && +info.monitor.weeklyRatio.ratio === 0) return // don't bother trying health 0
				if (this.config.settings.fetch.requireVersion.enabled) { // continue to restrict by version info
					if (info.stats && info.stats.software) { // stats has the information we need
						if (!semver.gte(info.stats.software.version, this.config.settings.fetch.requireVersion.version)) return
					} else if (this.config.settings.fetch.requireVersion.fallbackToHome) { // have to fetch from home
						const instance = this._createInstance(info.uri, {available: false})
						return instance.getVersionFromHome().then(version => {
							if (semver.gte(version, this.config.settings.fetch.requireVersion.version)) {
								// hurrah!
								instance.available = true
								loadedCount++
							} else {
								// :(
								this.instances.delete(instance.site)
							}
						}).catch(() => {}) // lol
					}
				}
				loadedCount++
				this._createInstance(info.uri, {})
			}))
			this.logger.log("info", "load ", `Loaded ${loadedCount.toString()} instances from the internet`)
		})
	}

	getWorkingInstances() {
		if (this.config.settings.switching.onlyWorking) {
			return [...this.instances.values()].filter(i => i.isWorking())
		} else {
			return [...this.instances.values()]
		}
	}

	/**
	 * @param {Instance[]} [working] A list of working instances, if you already have it
	 */
	getFastestInstance(working) {
		working = working || this.getWorkingInstances()
		return working.sort((a, b) => (a.getAverageTime() - b.getAverageTime()))[0]
	}

	getNextInstance() {
		return this.lastInstance = this._getNextInstance()
	}

	_getNextInstance() {
		// Prefer same instance?
		if (this.config.settings.switching.preferSame && this.lastInstance) {
			if (this.lastInstance.isWorking()) {
				return this.lastInstance
			}
		}
		// We need to find a new instance
		// Are any working?
		const working = this.getWorkingInstances()
		if (working.length === 0) {
			throw new Error("No working instances available")
		}
		// Which method to find the next one?
		if (this.config.settings.switching.method === "fastest") {
			return this.getFastestInstance(working)
		} else if (this.config.settings.switching.method === "random") {
			const index = Math.floor(Math.random()*working.length)
			return working[index]
		} else if (this.config.settings.switching.method === "roundrobin") {
			if (this.lastInstance) {
				let currentIndex = working.indexOf(this.lastInstance)
				currentIndex++
				if (currentIndex >= working.length) currentIndex = 0
				return working[currentIndex]
			} else {
				return working[0]
			}
		}
	}

	checkAll() {
		return this._checkSelection(this.instances.values())
	}

	checkRecommended() {
		let instances = [...this.instances.values()]
		if (this.config.settings.tracking.onlyDead) instances = instances.filter(i => i.shouldTryToSave())
		return this._checkSelection(instances)
	}

	async _checkSelection(iterable) {
		if (this.currentlyChecking) return
		this.currentlyChecking = true
		if (this.config.settings.tracking.parallel) {
			return Promise.all([...iterable].map(i => i.check())).then(() => this.currentlyChecking = false)
		} else {
			for (const instance of iterable) {
				await instance.check()
			}
			this.currentlyChecking = false
		}
	}
}

module.exports = Tracker
