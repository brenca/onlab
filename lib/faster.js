const fast = require('fast.js')
const crypto = require('crypto')

const md5 = value => {
  return crypto.createHash('md5').update(value).digest('hex')
}

fast.hash = function(array) {
  const items = array.map(item => item.SID ? item.SID : md5(item))
  if (items.length === 0) {
    return null
  } else if (items.length === 1) {
    return items[0]
  } else {
    return md5(items.join(''))
  }
}

fast.find = function(array, fn) {
  let results = []
  let length = array.length

  for (let i = 0; i < length; i++) {
    if (fn(array[i], i, array)) return array[i]
  }

  return undefined
}

fast.findIndex = function(array, fn) {
  let results = []
  let length = array.length

  for (let i = 0; i < length; i++) {
    if (fn(array[i], i, array)) return i
  }

  return undefined
}

fast.contains = function(x, a) {
  return fast.some(a, y => {
    if (y.equals) {
      return y.equals(x)
    }
    return y === x
  })
}

module.exports = fast
