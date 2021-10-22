const Parser = require('../lib/parser')
const uuid = require('uuid/v4')
const fs = require('fs')
const util = require('util')

const writeGraph = (root, filename = `root`) => {
  const label = (node, list, level = 0, seen = []) => {
    seen = seen.concat(node)
    node.uuid = uuid()
    node.level = level
    list.push(node)


    let max = level
    node.arcs.forEach(arc => {
      if (seen.indexOf(arc) === -1) {
        let l = label(arc, list, level + 1, seen)
        if (l > max) {
          max = l
        }
      }
    })

    return max
  }

  const graphFile = fs.createWriteStream(`${filename}.dot`, { flags: 'w' })
  const writeLog = function(d) {
    const stuff = d ? util.format(d) : ''
    graphFile.write(stuff + '\n')
  }

  let nodes = []
  let maxLevel = label(root, nodes)
  nodes = [...new Set(nodes)]

  writeLog('digraph g {')
  writeLog('graph [pad="0.5", nodesep="1", ranksep="2"];')
  writeLog('splines="false";')
  nodes.forEach(node => {
    const label = node.toString().replace('<', '&lt;').replace('>', '&gt;')
    writeLog(`"${node.uuid}" [label=<"${label}"<br/><font point-size="10">${node.hash.slice(0, 8)}</font> >  ${node.dotStyle()}]`)
  })
  nodes.forEach(node => {
    node.arcs.forEach((arc, i) => {
      writeLog(`"${node.uuid}" -> "${arc.uuid}" [label=<${i}>]`)
    })
  })

  const otherNodes = nodes.filter(node =>
    !(node instanceof Parser.SPPF.TerminalNode))
  for (let i = 0; i < maxLevel; i++) {
    writeLog(`{rank = same; ${otherNodes.filter(node => {
      return node.level === i
    }).map(node => `"${node.uuid}"`).join('; ')}}`)
  }

  writeLog(`{rank = same; ${nodes.filter(node => {
    return node instanceof Parser.SPPF.TerminalNode
  }).map(node => `"${node.uuid}"`).join('; ')}}`)
  writeLog('}')

  graphFile.end()
}

module.exports = {
  writeGraph
}
