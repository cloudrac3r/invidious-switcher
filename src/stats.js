/**
 * @param {number[]} records
 */
function mean(records) {
	// sum divided by count
	return records.reduce((acc, cur) => acc + (cur), 0) / records.length
}

/**
 * @param {number[]} records
 */
function median(records) {
	// item in middle, or mean of items in middle
	const sorted = records.slice().sort((a, b) => (a - b))
	if (sorted.length % 2 === 1) {
		// odd number of items
		return sorted[Math.floor(sorted.length / 2)]
	} else {
		// even number of items
		return mean(sorted.slice(sorted.length / 2 - 1, sorted.length / 2 + 1))
	}
}

module.exports.mean = mean
module.exports.median = median