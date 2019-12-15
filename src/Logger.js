const logLabels = [" ", ".", "!", "#"]
const logNames = ["spam", "info", "warn", "error"]

function getSixTime() {
	return new Date().toTimeString().split(" ")[0].replace(/:/g, "")
}

/**
 * Log events of a certain type and level.
 * 0 = spam, 1 = info, 2 = warn, 3 = error
 */
class Logger {
	constructor(defaultLevel) {
		this.defaultLevel = defaultLevel
	}

	/**
	 * Log an event.
	 * @param {string|number} level
	 * @param {string} source Exactly 5 characters, add whitespace if needed
	 * @param {...any} message
	 */
	log(level, source, ...message) {
		if (typeof level === "string") {
			level = logNames.indexOf(level)
			if (level === -1) {
				this.log("error", "log  ", "Invalid log string used in next message")
				level = this.defaultLevel
			}
		}
		if (level >= this.defaultLevel) {
			console.log(`[${logLabels[level]}] [${getSixTime()}] [${source}]`, ...message)
		}
	}
}

module.exports = Logger
