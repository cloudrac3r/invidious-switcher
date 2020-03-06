/** @type {import("wumpfetch").default} */
// @ts-ignore
const wumpfetch = require("wumpfetch")
const tc = require("tough-cookie")
const fhp = require("fast-html-parser")
const merge = require("merge-options")
const {EventEmitter} = require("events")
const timer = require("./timer")
const stats = require("./stats")
require("./testimports")(timer, stats)

const recordsToCheck = 5
const recordsToStore = recordsToCheck

/**
 * Remove trailing slashes from URLs
 */
function normaliseURL(url) {
	return url.replace(/\/+$/g, "")
}

function filterElements(nodes) {
	return nodes.filter(node => node && node.constructor && node.constructor.name === "HTMLElement")
}

class Instance {
	/**
	 * @param {object} input
	 * @param {import("./Config")} input.config
	 * @param {import("./Logger")} input.logger
	 * @param {{useCookies?: boolean, trackingMethod?: string, headers?: any, available?: boolean}} options
	 */
	constructor({config, logger}, site, options = {}) {
		this.config = config
		this.logger = logger
		this.site = normaliseURL(site)
		this.options = options
		this.jar = this.options.useCookies ? new tc.CookieJar() : null
		this.events = new EventEmitter()
		this.blacklistedKinds = new Set()
		this.available = this.options.available !== undefined ? this.options.available : true
		delete this.options.available // never used again by code, but this avoids confusion when inspecting

		/** @type {{working: boolean, time: number}[]} */
		this.records = []
	}

	static normaliseConfig(data) {
		if (typeof data === "string") return [normaliseURL(data), {}] // just a URL
		else return [normaliseURL(data.site), data.options] // object
	}

	isWorking() {
		if (!this.available) return false
		const records = this.records.slice(0, recordsToCheck)
		if (this.config.settings.detection.useMedianWorking) {
			return stats.median(records.map(r => +r.working)) >= this.config.settings.detection.acceptableWorkingRate
		} else {
			return stats.mean(records.map(r => +r.working)) >= this.config.settings.detection.acceptableWorkingRate
		}
	}

	shouldTryToSave() {
		return this.available && !this.isWorking()
	}

	getAverageTime() {
		const records = this.records.slice(0, recordsToCheck)
		if (this.config.settings.detection.useMedianTime) {
			return Math.round(stats.median(records.map(r => r.time)))
		} else {
			return Math.round(stats.mean(records.map(r => r.time)))
		}
	}

	check() {
		if (this.options.trackingMethod) {
			var method = this.options.trackingMethod
		} else {
			var method = this.config.settings.tracking.method
		}
		const result =
			method === "home"
				? this.checkHome()
			: method === "stats"
				? this.checkStats()
			: method === "video"
				? this.checkVideo()
			: method === "channel"
				? this.checkChannel()
				: null
		if (result === null) throw new Error("Invalid method, need (home|stats|video|channel), got "+method)
		return result
	}

	checkHome() {
		return this._makeTimedCookieRequest("/feed/trending", {method: "HEAD"}).then(([time, res]) => {
			const working = res.statusCode === 200
			return [working, time]
		}).catch(error => {
			if (Array.isArray(error)) {
				const [time] = error
				return [false, time]
			} else {
				return Promise.reject(error)
			}
		}).then(([working, time]) => {
			this._addRecord("home", working, time)
			return working
		})
	}

	getVersionFromHome() {
		return this._makeTimedCookieRequest("/feed/trending").then(([time, res]) => {
			if (res.statusCode !== 200) return Promise.reject([time, res.statusCode])
			this._addRecord("home", true, time)
			const html = res.text()
			const dom = fhp.parse(html)
			const footer = dom.querySelector(".footer")
			const footerInner = filterElements(footer.childNodes)[0]
			const footerParts = filterElements(footerInner.childNodes)
			const version = footerParts.reduce((acc, element) => {
				if (acc) return acc
				if (!filterElements(element.childNodes).some(e => e.classNames.includes("ion-logo-github"))) return
				const text = element.structuredText
				const match = text.match(/^.*?: *(\S+)/)
				if (!match) return
				return match[1]
			}, null)
			if (!version) return Promise.reject("Version not detectable")
			this.logger.log("spam", "ver  ", "avai", "|", this.site, "->", version)
			return version
		}).catch(error => {
			if (Array.isArray(error)) {
				const [time] = error
				this._addRecord("home", false, time)
			}
			this.logger.log("spam", "ver  ", "x   ", "|", this.site)
			return Promise.reject(error)
		})
	}

	checkStats() {
		return this._makeTimedCookieRequest("/api/v1/stats", {method: "HEAD"}).then(([time, res]) => {
			const working = res.statusCode === 200
			return [working, time]
		}).catch(error => {
			if (Array.isArray(error)) {
				const [time] = error
				return [false, time]
			} else {
				return Promise.reject(error)
			}
		}).then(([working, time]) => {
			this._addRecord("stats", working, time)
			return working
		})
	}

	/**
	 * Make a request to the instance API.
	 * The result will be logged to the console and added to the instance records.
	 * Resolves with data on success, rejects with info on failure.
	 */
	makeAPIRequest(kind, endpoint) {
		if (this.blacklistedKinds.has(kind)) return Promise.reject("Instance is unavailable: this kind of request was blacklisted")
		return this._makeTimedCookieRequest(endpoint).then(([time, res]) => {
			if (res.statusCode === 200) {
				/*
					Possibilities:
					- Presumably reasonable JSON response data
					- Weird non-JSON response despite status code
				*/
				try {
					const data = res.json()
					// JSON
					return [true, time, data]
				} catch (e) {
					// weird
					return [false, time, res.text()]
				}
			} else if (res.statusCode === 500) {
				/*
					Possibilities:
					- Instance is blocked (down) (JSON error)
					- Video unavailable (depends) (JSON error)
					- Some internal server error (down) (not JSON)
				*/
				try {
					const data = res.json()
					// json
					if (typeof data.error === "string" && data.error.includes("blocked")) {
						// Instance is blocked (down)
						return [false, time, res.json()]
					} else {
						// Video unavailable (depends)
						return [!this.config.settings.detection.considerUnavailableAsBlocked, time, res.json()]
					}
				} catch (e) {
					// Some internal server error (down)
					return [false, time, res.text()]
				}
			} else if (res.statusCode === 403) {
				// Deliberately want to stop us from doing this
				this.logger.log("spam", "blist", `Blacklisted: ${kind} on ${this.site}`)
				this.blacklistedKinds.add(kind)
				return [false, time, res.text()]
			} else {
				// Some other status code that we don't want
				return [false, time, res.text()]
			}
		}).catch(error => {
			/*
				Possiblities:
				- Some request error, will be array with time
				- Some error from `then` block
			*/
			if (Array.isArray(error)) {
				// Request error, instance is down
				const [time] = error
				return [false, time, null]
			} else {
				throw error // if we get here, it's a bug which needs to be fixed in the `then` block
			}
		}).then(([working, time, res]) => {
			this._addRecord(kind, working, time)
			if (working) return res
			else throw new Error("Instance is unavailable: "+res)
		})
	}

	requestVideo(id) {
		return this.makeAPIRequest("video", `/api/v1/videos/${id}`)
	}

	checkVideo(id = "dQw4w9WgXcQ") {
		return this.requestVideo(id).then(() => true, () => false)
	}

	requestChannel(id) {
		return this.makeAPIRequest("channel", `/api/v1/channels/${id}`)
	}

	checkChannel(id = "UC38IQsAvIsxxjztdMZQtwHA") {
		return this.requestChannel(id).then(() => true, () => false)
	}

	requestChannelVideos(id) {
		return this.makeAPIRequest("channel", `/api/v1/channels/${id}/videos`)
	}

	requestChannelLatest(id) {
		return this.makeAPIRequest("channel", `/api/v1/channels/${id}/latest`)
	}

	_makeTimedRequest(endpoint, options = {}) {
		const url =
			endpoint.startsWith("http://") || endpoint.startsWith("https://")
			? endpoint
			: this.site + endpoint
		if (!options.headers) options.headers = {}
		if (this.config.settings.http) options = merge(options, this.config.settings.http)
		if (this.options.headers) Object.assign(options.headers, this.options.headers)
		if (this.options.useCookies) {
			const cookie = this.jar.getCookieStringSync(url)
			if (cookie) options.headers["Cookie"] = cookie
		}
		const inprogress = new Promise((resolve, reject) => {
			const sent = wumpfetch(url, options).send()
			if (this.config.settings.http && this.config.settings.http.timeout) {
				setTimeout(() => {
					// this will do nothing if `sent` has already completed because promises are good
					reject(new Error("Manual timeout reached"))
				}, this.config.settings.http.timeout)
			}
			sent.then(resolve, reject)
		})
		return timer(inprogress)
	}

	/**
	 * @returns {Promise<[number, import("wumpfetch").WumpResponse]>}
	 */
	_makeTimedCookieRequest(endpoint, options = {}) {
		return this._makeTimedRequest(endpoint, options).then(([time, res]) => {
			if (res.statusCode === 307 && this.options.useCookies && res.headers["set-cookie"]) { // jankery for invidiou.sh bot protection
				const cookieLines = Array.isArray(res.headers["set-cookie"]) ? res.headers["set-cookie"] : [res.headers["set-cookie"]]
				cookieLines.forEach(line => this.jar.setCookieSync(line, this.site))
				if (res.headers["location"]) endpoint = res.headers["location"]
				return this._makeTimedRequest(endpoint, options).then(([time2, res]) => {
					return [time + time2, res]
				})
			} else {
				return [time, res]
			}
		})
	}

	_addRecord(method, working, time) {
		// add record
		this.records.unshift({working, time})
		if (this.records.length > recordsToStore) this.records.pop()
		// log
		const methodString = method.padEnd(7)
		const workingString = working ? " up " : "down"
		const timeString = `${time.toString().padStart(5)}ms`
		const avgTimeString = `${this.getAverageTime().toString().padStart(5)}ms avg`
		this.logger.log("spam", "check", `${workingString} | ${timeString} | ${avgTimeString} | ${methodString} | ${this.site}`)
		// emit event
		this.events.emit("record", working, time)
	}
}

module.exports = Instance
