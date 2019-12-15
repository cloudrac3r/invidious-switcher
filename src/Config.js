const fs = require("fs")
const path = require("path")

/**
 * Holds settings that other classes can read to see how they should behave.
 * Loads from a file on startup.
 * You can also edit the settings object to apply settings dynamically.
 */
class Config {
	/**
	 * @param {string} [filename] Default filename to save and load from
	 */
	constructor(filename) {
		// This is for your own good, I promise.
		if (!filename) {
			console.log(
				""
				+"\n ! ===== ! ===== ! ===== !"
				+"\n"
				+"\nConfig was not passed a filename to read from. The default config file will be used."
				+"\nIn future, please supply your own config file!"
				+"\nYou can download the template from https://github.com/cloudrac3r/invidious-switcher or copy it from `node_modules/invidious-switcher/config.json`."
				+"\n"
				+"\n ! ===== ! ===== ! ===== !"
				+"\n"
			)
		}

		/** Default filename to save and load from */
		this.filename = filename || path.join(__dirname, "../config.json")

		/**
		 * Settings are stored here
		 * @type {import("../config.json")}
		 */
		this.settings

		this.load()
	}

	/**
	 * Synchronously load settings from a file.
	 * @param {string} [filename]
	 */
	load(filename) {
		if (!filename) filename = this.filename
		let body = fs.readFileSync(filename, {encoding: "utf8"})
		body = body.replace(/\s+\/\/[^"\n]*$/gm, "") // remove comments
		this.settings = JSON.parse(body)
		// jankery for correct user-agent string
		if (this.settings && this.settings.http && this.settings.http.headers && this.settings.http.headers["User-Agent"]) {
			const version = require("../package.json").version
			this.settings.http.headers["User-Agent"] = this.settings.http.headers["User-Agent"].replace(/\$version/g, version)
		}
	}
}

module.exports = Config
