import fs from 'fs'
import util from 'util'
import path from 'path'
import { ABI_SIGNATURE } from './types'
import { addSignatureDataToAbi, filterEvents } from './utils'

const readDir = util.promisify(fs.readdir)
const readFile = util.promisify(fs.readFile)
const writeFile = util.promisify(fs.writeFile)

const jsonPath = `${__dirname}/jsonAbis`
const ozPath = path.resolve('node_modules/openzeppelin-solidity/build/contracts')
const destinationFile = `${__dirname}/compiled_abi.json`

compileAbi([jsonPath, ozPath]).then(abi => {
  writeFile(destinationFile, JSON.stringify(abi, null, 2))
    .then(() => {
      console.log(`New ABI saved on ${destinationFile}`)
      process.exit(0)
    })
})

async function compileAbi (dirs) {
  try {
    let jsonFiles = []
    for (let dir of dirs) {
      let files = await readDir(dir)
      files = files.filter(file => path.extname(file) === '.json')
      if (!files || !files.length) throw new Error(`No json files in dir ${dir}`)
      jsonFiles = jsonFiles.concat(files.map(file => `${dir}/${file}`))
    }
    let abi = await Promise.all(jsonFiles.map(file => readJson(`${file}`).then(content => {
      return (Array.isArray(content)) ? content : content.abi
    })))
    if (!abi) throw new Error(`Invalid abi `)
    abi = abi.reduce((a, v, i, array) => v.concat(a))
    abi = processAbi(abi)
    return abi
  } catch (err) {
    console.log('Compile Error', err)
    process.exit(9)
  }
}

async function readJson (file) {
  console.log(`Reading file ${file}`)
  try {
    let json = await readFile(file, 'utf-8')
    return JSON.parse(json)
  } catch (err) {
    console.log(file, err)
    return Promise.reject(err)
  }
}

export function processAbi (abi) {
  // remove fallbacks
  abi = abi.filter(a => a.type !== 'fallback')
  // remove duplicates
  abi = [...new Set(abi.map(a => JSON.stringify(a)))].map(a => JSON.parse(a))
  // add signatures
  abi = addSignatureDataToAbi(abi)
  // detect 4 bytes collisions
  let signatures = (abi.map(a => a[ABI_SIGNATURE].signature)).filter(v => v)
  signatures = [...new Set(signatures)]
  let fourBytes = signatures.map(s => s.slice(0, 8))
  if (fourBytes.length !== [...new Set(fourBytes)].length) {
    console.log(fourBytes.filter((v, i) => fourBytes.indexOf(v) !== i))
    throw new Error('4bytes collision')
  }
  // filter events
  abi = filterEvents(abi)
  return abi
}

process.on('unhandledRejection', err => {
  console.error(err)
  process.exit(9)
})
