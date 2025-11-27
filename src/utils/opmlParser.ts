import { XMLParser } from 'fast-xml-parser'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export interface RSSFeed {
  title: string
  xmlUrl: string
  htmlUrl?: string
}

export function parseOPML(): RSSFeed[] {
  const opmlPath = path.join(__dirname, '..', '..', 'RAW.opml')
  const opmlContent = fs.readFileSync(opmlPath, 'utf-8')
  
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
  })
  
  const opml = parser.parse(opmlContent)
  const feeds: RSSFeed[] = []
  
  function extractFeeds(outline: any): void {
    if (Array.isArray(outline)) {
      outline.forEach(item => extractFeeds(item))
    } else if (outline) {
      if (outline['@_type'] === 'rss' && outline['@_xmlUrl']) {
        feeds.push({
          title: outline['@_text'] || outline['@_title'] || 'Untitled',
          xmlUrl: outline['@_xmlUrl'],
          htmlUrl: outline['@_htmlUrl'],
        })
      }
      if (outline.outline) {
        extractFeeds(outline.outline)
      }
    }
  }
  
  if (opml.opml?.body?.outline) {
    extractFeeds(opml.opml.body.outline)
  }
  
  return feeds
}

