const crypto = require('crypto')
const fast = require('./faster')

const SubclassMap = { }

class SerializedData {
  constructor(CNAME, id, data) {
    this.CNAME = CNAME
    this.SID = id
    this.data = data
  }

  fullJSON() {
    return {
      CNAME: this.CNAME,
      SID: this.SID,
      DATA: this.data
    }
  }

  referenceJSON() {
    return {
      CNAME: this.CNAME,
      SID: this.SID,
      REF: 1
    }
  }
}

class Serializable {
  constructor() {
    if (!SubclassMap[this.constructor.name]) {
      throw new Error(`Please register '${this.constructor.name}' ` +
        `with Serializable.registerSubclass`)
    }

    const randomBytes = crypto.randomBytes(20).toString('hex')
    this.SID = crypto.createHash('md5').update(randomBytes).digest('hex')
  }

  toJSON() {
    return new SerializedData(
      this.constructor.name,
      this.SID,
      this.serialize()
    )
  }

  serialize() {
    return fast.reduce(Object.keys(this), (a, key) => {
      if (key === 'SID') {
        return a
      }

      a[key] = this[key]
      return a
    }, { })
  }

  equals(other) {
    return other !== undefined && other !== null &&
      this.SID === other.SID
  }

  static serialize(objects) {
    const map = { }
    const json = JSON.stringify(objects, (key, value) => {
      if (value instanceof SerializedData) {
        if (map[value.SID] !== undefined) {
          return value.referenceJSON()
        } else {
          map[value.SID] = true
          return value.fullJSON()
        }
      }

      return value
    })

    return json
  }

  static deserialize(json) {
    const map = { }

    const objects = JSON.parse(json, (key, value) => {
      if (value !== null && typeof value === 'object') {
        if (value.SID === undefined || value.CNAME === undefined) {
          return value
        } else {
          if (map[value.SID]) {
            if (value.REF === undefined) {
              const revived = map[value.SID]
              fast.forEach(Object.keys(value.DATA),
                key => revived[key] = value.DATA[key]
              )
              return map[value.SID]
            } else {
              return map[value.SID]
            }
          } else if (value.REF === 1) {
            map[value.SID] = new SubclassMap[value.CNAME]()
            return map[value.SID]
          } else {
            const revived = new SubclassMap[value.CNAME]()
            fast.forEach(Object.keys(value.DATA),
              key => revived[key] = value.DATA[key]
            )
            map[value.SID] = revived
            return map[value.SID]
          }
        }
      }

      return value
    })

    return objects
  }

  static registerSubclass(subclass) {
    SubclassMap[subclass.name] = subclass
  }
}

module.exports = { Serializable }
