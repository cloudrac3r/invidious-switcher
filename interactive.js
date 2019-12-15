const Switcher = require("./src/Switcher")
const repl = require("repl")

const switcher = new Switcher()

const r = repl.start("")
r.context.switcher = switcher
