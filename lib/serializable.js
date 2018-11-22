const uuid = require('uuid/v4')
const fast = require('./faster')

const SubclassMap = { }

class Serializable {
  constructor(sid) {
    if (!SubclassMap[this.constructor.name]) {
      throw new Error(`Please register '${this.constructor.name}' ` +
        `with Serializable.registerSubclass`)
    }

    if (sid !== undefined) {
      this.SID = sid
    }
  }

  get SID() {
    if (!this.$sid) {
      this.$sid = uuid()
    }

    return this.$sid
  }

  set SID(sid) {
    this.$sid = sid
  }

  serialize() {
    throw new Error(`${this.constructor.name}.serialize is not implemented`)
  }

  deserialize(object) {
    throw new Error(`${this.constructor.name}.deserialize is not implemented`)
  }

  toSerialData() {
    return {
      $class: this.constructor.name,
      $sid: this.SID,
      $data: this.serialize()
    }
  }

  toSerialReference() {
    return {
      $class: this.constructor.name,
      $ref: this.SID
    }
  }

  static isSerialData(object) {
    return object.$class !== undefined
        && object.$sid !== undefined
        && object.$data !== undefined
  }

  static isSerialRef(object) {
    return object.$class !== undefined
        && object.$ref !== undefined
  }

  static serialize(objects) {
    const map = { }
    return JSON.stringify(objects, (key, object) => {
      if (object instanceof Serializable) {
        if (map[object.SID]) {
          return object.toSerialReference()
        } else {
          map[object.SID] = true
          return object.toSerialData()
        }
      }

      return object
    })
  }

  static deserialize(json) {
    const map = { }
    return JSON.parse(json, (key, object) => {
      if (object !== null && typeof object === 'object') {
        if (Serializable.isSerialRef(object)) {
          if (!map[object.$ref]) {
            map[object.$ref] = new SubclassMap[object.$class]()
          }

          return map[object.$ref]
        } else if (Serializable.isSerialData(object)) {
          if (!map[object.$sid]) {
            map[object.$sid] = new SubclassMap[object.$class]()
          }
          map[object.$sid].deserialize(object)
          map[object.$sid].SID = object.$sid

          return map[object.$sid]
        }
      }

      return object
    })
  }

  static registerSubclass(subclass) {
    SubclassMap[subclass.name] = subclass
  }

  equals(other) {
    return other !== undefined && other !== null &&
      this.SID === other.SID
  }
}

class SerializableLookupMap extends Serializable {
  constructor(addedHook, deletedHook) {
    super()
    this.$addedHook = addedHook
    this.$deletedHook = deletedHook
    this.map = { }
  }

  serialize() {
    return {
      map: this.map
    }
  }

  deserialize(object) {
    this.map = object.$data.map
  }

  set(index, value) {
    if (!this.map[index]) {
      this.map[index] = [value]
    } else {
      this.map[index].push(value)
    }

    this.$addedHook(index, value)
  }

  delete(index, value) {
    if (this.map[index]) {
      this.map[index] = fast.filter(this.map[index], x => x !== value)
      if (this.map[index].length === 0) {
        this.map[index] = undefined
      }
    }

    this.$deletedHook(index, value)
  }

  adjust(index) {
    this.forEach(key => {
      if (this.map[key] !== undefined) {
        this.map[key] = fast.map(this.map[key], value => {
          if (value >= index) {
            return value - 1
          } else {
            return value
          }
        })
      }
    })
  }

  get(index) {
    return this.map[index]
  }

  forEach(func) {
    fast.forEach(Object.keys(this.map), key => func(key, this.map[key]))
  }
}
Serializable.registerSubclass(SerializableLookupMap)

class SerializableLookupArray extends Serializable {
  constructor(items) {
    super()

    this.$parent = null
    this.$lookupMap = null
    this.subarrayMap = { }
    this.store = []

    if (items instanceof Array) {
      fast.forEach(items, (v, i) => this.add(v, i))
    } else if (items !== undefined) {
      this.add(items, 0)
    }
  }

  serialize() {
    return {
      $parent: this.$parent,
      lookupMap: this.lookupMap,
      subarrayMap: this.subarrayMap,
      store: this.store,
    }
  }

  deserialize(object) {
    this.$parent = object.$data.$parent
    this.lookupMap = object.$data.lookupMap

    this.lookupMap.$addedHook = (index, value) => {
      if (this.parent) {
        this.parent.addedTo(this, this.get(value))
      }
    }

    this.lookupMap.$deletedHook =(index, value) => {
      if (this.parent) {
        this.parent.removedFrom(this, this.get(value))
      }
    }

    this.subarrayMap = object.$data.subarrayMap
    this.store = object.$data.store
  }

  get parent() {
    return this.$parent
  }

  set parent(parent) {
    this.$parent = parent

    this.lookupMap.forEach((key, value) => {
      parent.addedTo(this, this.get(value[0]))
    })
  }

  get lookupMap() {
    if (!this.$lookupMap) {
      this.$lookupMap = new SerializableLookupMap((index, value) => {
        if (this.parent) {
          this.parent.addedTo(this, this.get(value))
        }
      }, (index, value) => {
        if (this.parent) {
          this.parent.removedFrom(this, this.get(value))
        }
      })
    }

    return this.$lookupMap
  }

  set lookupMap(map) {
    this.$lookupMap = map
  }

  reset(array) {
    fast.forEach(
      this.store.slice(),
      (value, index) => this.remove(value, index)
    )

    if (array !== undefined) {
      if (array instanceof SerializableLookupArray) {
        array.forEach((value, index) => this.add(value, index))
      } else {
        fast.forEach(array, (value, index) => this.add(value, index))
      }
    }
  }

  add(value, index, justMap = false) {
    if (!justMap) {
      this.store[index] = value
    }

    if (value instanceof SerializableLookupArray) {
      this.subarrayMap[value.SID] = index
      value.parent = this
    } else if (value.SID !== undefined) {
      this.lookupMap.set(value.SID, index)
    }
  }

  remove(value, index, justMap = false) {
    if (value instanceof SerializableLookupArray) {
      this.subarrayMap[value.SID] = undefined
    } else if (value.SID !== undefined) {
      this.lookupMap.delete(value.SID, index)
    }

    if (!justMap) {
      this.store.splice(index, 1)
      this.lookupMap.adjust(index)
    }
  }

  addedTo(subarray, what) {
    this.add(what, this.subarrayMap[subarray.SID], true)
  }

  removedFrom(subarray, what) {
    this.remove(what, this.subarrayMap[subarray.SID], true)
  }

  get length() {
    return this.store.length
  }

  forEach(func) {
    return fast.forEach(this.store, func)
  }

  findIndex(func) {
    return fast.findIndex(this.store, func)
  }

  find(func) {
    return fast.find(this.store, func)
  }

  filter(func) {
    return fast.filter(this.store, func)
  }

  map(func) {
    return fast.map(this.store, func)
  }

  reduce(func, acc) {
    return fast.reduce(this.store, func, acc)
  }

  some(func) {
    return fast.some(this.store, func)
  }

  push(value) {
    this.add(value, this.length)
  }

  get(index) {
    return this.store[index]
  }

  set(value, index) {
    this.add(value, index)
  }

  indexOfItem(value) {
    const indexes = this.lookupMap.get(value.SID)
    if (indexes !== undefined) {
      return indexes[0]
    } else {
      return -1
    }
  }
}
Serializable.registerSubclass(SerializableLookupArray)

class SerializableLookupSet extends SerializableLookupArray {
  constructor(items) {
    super(items)
  }

  add(value, index) {
    if (this.indexOfItem(value) < 0) {
      super.add(value, index)
    }
  }

  static union(a, b) {
    const result = new SerializableLookupSet()

    const length = Math.max(a.length, b.length)
    for (let i = 0; i < length; i++) {
      if (i < a.length) result.push(a.get(i))
      if (i < b.length) result.push(b.get(i))
    }

    return result
  }

  union(b) {
    for (let i = 0; i < b.length; i++) {
      this.push(b.get(i))
    }

    return this
  }
}
Serializable.registerSubclass(SerializableLookupSet)

module.exports = {
  Serializable,
  SerializableLookupArray,
  SerializableLookupSet
}
