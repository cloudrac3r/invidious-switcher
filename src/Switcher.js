const {EventEmitter} = require("events")
const Config = require("./Config")
const Logger = require("./Logger")
const Tracker = require("./Tracker")
require("./testimports")(Config, Logger, Tracker)

/**
 * Main class for Invidious Switcher
 */
class Switcher {
	constructor(config) {
		this.ready = false
		this.events = new EventEmitter()

		if (typeof config === "string") {
			this.config = new Config(config)
		} else if (config instanceof Config) {
			this.config = config
		} else if (!config) {
			this.config = new Config()
		} else {
			throw new Error("Invalid configuration")
		}
		this.logger = new Logger(this.config.settings.logger.defaultLevel)
		this.tracker = new Tracker({config: this.config, logger: this.logger})

		this.tracker.events.once("ready", () => {
			this.ready = true
			this.events.emit("ready")
		})
	}

	waitForReady() {
		if (this.ready) return Promise.resolve()
		else return new Promise(resolve => {
			this.events.once("ready", () => resolve())
		})
	}

	/**
	 * @param {() => Promise<T>} callback
	 * @returns {Promise<T>}
	 * @template T
	 */
	_repeat(callback) {
		return callback().catch(() => {
			return this._repeat(callback)
		})
	}
		

	requestVideo(id) {
		return this._repeat(() => this.tracker.getNextInstance().requestVideo(id))
	}

	requestChannel(id) {
		return this._repeat(() => this.tracker.getNextInstance().requestChannel(id))
	}

	requestChannelVideos(id) {
		return this._repeat(() => this.tracker.getNextInstance().requestChannelVideos(id))
	}

	requestChannelLatest(id) {
		return this._repeat(() => this.tracker.getNextInstance().requestChannelLatest(id))
	}
}

module.exports = Switcher
