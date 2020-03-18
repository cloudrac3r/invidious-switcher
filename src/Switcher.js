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
	 * @param {(instance: import("./Instance")) => Promise<T>} callback
	 * @returns {Promise<T>}
	 * @template T
	 */
	async _repeatWithNewInstance(callback) {
		const instance = this.tracker.getNextInstance()
		return callback(instance).catch(() => {
			return this._repeatWithNewInstance(callback)
		})
	}

	makeAPIRequest(kind, endpoint) {
		return this._repeatWithNewInstance(instance => instance.makeAPIRequest(kind, endpoint))
	}

	requestVideo(id) {
		return this._repeatWithNewInstance(instance => instance.requestVideo(id))
	}

	requestChannel(id) {
		return this._repeatWithNewInstance(instance => instance.requestChannel(id))
	}

	requestChannelVideos(id) {
		return this._repeatWithNewInstance(instance => instance.requestChannelVideos(id))
	}

	requestChannelLatest(id) {
		return this._repeatWithNewInstance(instance => instance.requestChannelLatest(id))
	}
}

module.exports = Switcher
