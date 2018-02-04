Array.prototype.hash = function() {
  const items = this.map(item => item.hash ? item.hash() : md5(item))
  if (items.length === 0) {
    return null
  } else if (items.length === 1) {
    return items[0]
  } else {
    return md5(items.join(''))
  }
}

Array.prototype.fastFilter = function(fn) {
  let results = []
  let array = this
  let length = this.length
  let item = null

  for (let i = 0; i < length; i++) {
    item = array[i]
    if (fn(item, i, array)) results.push(item)
  }

  return results
}

Array.prototype.fastMap = function(fn) {
  let results = []
  let array = this
  let length = this.length

  for (let i = 0; i < length; i++) {
    results.push(fn(array[i], i, array))
  }

  return results
}

Array.prototype.fastSome = function(fn) {
  let results = []
  let array = this
  let length = this.length

  for (let i = 0; i < length; i++) {
    if (fn(array[i], i, array)) return true
  }

  return false
}

Array.prototype.fastFind = function(fn) {
  let results = []
  let array = this
  let length = this.length

  for (let i = 0; i < length; i++) {
    if (fn(array[i], i, array)) return array[i]
  }

  return undefined
}

Array.prototype.fastFindIndex = function(fn) {
  let results = []
  let array = this
  let length = this.length

  for (let i = 0; i < length; i++) {
    if (fn(array[i], i, array)) return i
  }

  return undefined
}

Array.prototype.fastForEach = function(fn, thisArg) {
  let array = this
  let length = this.length

  for (let i = 0; i < length; i++) {
    if (thisArg) {
      fn.call(thisArg, array[i], i, array)
    } else {
      fn(array[i], i, array)
    }
  }

  return this
}

module.exports = Array.prototype