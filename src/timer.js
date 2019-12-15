/**
 * @param {Promise<T>} promise
 * @returns {Promise<[number, T]>}
 * @template T
 */
function timer(promise) {
	const d = Date.now()
	// @ts-ignore
	return promise.then(result => {
		const time = Date.now() - d
		return [time, result]
	}).catch(error => {
		const time = Date.now() - d
		return Promise.reject([time, error])
	})
}

module.exports = timer
