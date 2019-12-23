'use strict'

const { getHash } = require('blockchain-spv')

function getLocator (chain) {
  let locator = []
  let length = Math.min(6, chain.store.length)
  for (let i = 0; i < length; i++) {
    let header = chain.getByHeight(chain.height() - i)
    locator.push(getHash(header))
  }
  return locator
}

async function sleep(time) { return new Promise((resolve) => setTimeout(resolve, time)); }

module.exports = async function (chain, peers, opts = {}) {
  opts.concurrency = opts.concurrency || 15

  while (true) {
    if ( peers.peers.length > 3) { break; } else {
      console.log("peer is not enough, now it is ",peers.peers.length);
    }
    await sleep(5*1000);
  }

  console.log('start the download ')

  while (true) {
    // fetch headers
    let locator = getLocator(chain)

    console.log('start the download promise')
    let res = await new Promise((resolve, reject) => {
      // request from multiple peers, uses more bandiwdth but is faster
      // only the fastest response resolves
      let concurrency = Math.min(opts.concurrency, peers.peers.length)
      console.log('concurrency downloaders is --------> ',concurrency)
      for (let i = 0; i < concurrency; i++) {
        peers.getHeaders(locator, (err, headers, peer) => {
          if (err) return reject(err)
          resolve({headers, peer})
        })
      }
    })

    console.log('headers lenth',res.headers.length)

    try {
      if (res.headers.length === 0) {
        // no more headers, we're at tip
        // TODO: time heuristic
        break
      }

      // make sure headers connect to chain
      let connectsTo
      try {
        connectsTo = chain.getByHash(res.headers[0].header.prevHash)
      } catch (err) {
        throw Error('Headers do not connect to chain')
      }

      // add heights to header objects
      let height = connectsTo.height + 1
      let headers = res.headers.map(({ header }, i) =>
        Object.assign(header, { height: height + i }))

      // verify and add to chain
      chain.add(headers)

      // less than 2000 headers, we reached the tip
      // TODO: time heuristic

      if (headers.length < 2000) break
    } catch (err) {
      // verification failed, disconnect peer
      res.peer.disconnect_download(err)
    }
  }
}