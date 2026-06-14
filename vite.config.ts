import { spawn } from 'node:child_process'
import { closeSync, createReadStream, existsSync, mkdirSync, openSync, readSync, readdirSync, statSync } from 'node:fs'
import { basename, extname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv, type Plugin } from 'vite'

const projectRoot = fileURLToPath(new URL('.', import.meta.url))
const imageExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp'])
const encodePathSegment = (value: string) => encodeURIComponent(value).replaceAll('(', '%28').replaceAll(')', '%29')

function detectImageContentType(imagePath: string) {
  const header = Buffer.alloc(12)
  const file = openSync(imagePath, 'r')
  readSync(file, header, 0, header.length, 0)
  closeSync(file)
  if (header.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))) return 'image/png'
  if (header.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return 'image/jpeg'
  if (header.subarray(0, 4).toString('ascii') === 'RIFF' && header.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp'
  return 'application/octet-stream'
}

function sendJson(response: any, status: number, value: unknown) {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.end(JSON.stringify(value))
}

function readJson(request: any) {
  return new Promise<any>((resolveBody, reject) => {
    let body = ''
    request.on('data', (chunk: Buffer) => { body += chunk.toString('utf8') })
    request.on('end', () => {
      try {
        resolveBody(body ? JSON.parse(body) : {})
      } catch (error) {
        reject(error)
      }
    })
    request.on('error', reject)
  })
}

function localTaggerPlugin(env: Record<string, string>): Plugin {
  const imageFolder = resolve(env.LORA_IMAGE_FOLDER || 'C:\\Users\\Moc\\Pictures\\yj')
  const pythonPath = env.WD14_PYTHON || 'D:\\BaiduNetdiskDownload\\更新环境库的webui Forge整合包\\sd-webui-forge-aki-v4.8\\python\\python.exe'
  const scriptPath = join(projectRoot, 'scripts', 'wd14_tagger.py')
  const previewScriptPath = join(projectRoot, 'scripts', 'flatten_preview.py')
  const previewFolder = join(projectRoot, '.local-cache', 'previews')
  mkdirSync(previewFolder, { recursive: true })

  const listImages = () => readdirSync(imageFolder)
    .filter((name) => imageExtensions.has(extname(name).toLowerCase()))
    .filter((name) => statSync(join(imageFolder, name)).isFile())
    .sort((left, right) => left.localeCompare(right))

  return {
    name: 'local-wd14-tagger',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const url = new URL(request.url || '/', 'http://localhost')

        if (request.method === 'GET' && url.pathname === '/api/local-images') {
          try {
            const names = listImages()
            sendJson(response, 200, {
              folderName: basename(imageFolder),
              provider: '本地 WD14 Danbooru Tagger',
              images: names.map((name) => ({
                id: `local-${encodePathSegment(name)}`,
                name,
                url: `/api/local-image/${encodePathSegment(name)}?v=${Math.floor(statSync(join(imageFolder, name)).mtimeMs)}`,
              })),
            })
          } catch (error) {
            sendJson(response, 500, { error: error instanceof Error ? error.message : '无法读取图片文件夹' })
          }
          return
        }

        if (request.method === 'GET' && url.pathname.startsWith('/api/local-image/')) {
          const name = basename(decodeURIComponent(url.pathname.slice('/api/local-image/'.length)))
          const imagePath = join(imageFolder, name)
          if (!imageExtensions.has(extname(name).toLowerCase()) || !existsSync(imagePath)) {
            sendJson(response, 404, { error: '图片不存在' })
            return
          }
          let servedPath = imagePath
          let contentType = detectImageContentType(imagePath)
          if (contentType === 'image/png' && extname(name).toLowerCase() !== '.png') {
            const previewPath = join(previewFolder, `${name}.preview.jpg`)
            const previewIsFresh = existsSync(previewPath) && statSync(previewPath).mtimeMs >= statSync(imagePath).mtimeMs
            if (!previewIsFresh) {
              const preview = spawnSync(pythonPath, [previewScriptPath, '--input', imagePath, '--output', previewPath], { cwd: projectRoot, windowsHide: true })
              if (preview.status !== 0) {
                sendJson(response, 500, { error: preview.stderr.toString('utf8') || '无法生成图片预览' })
                return
              }
            }
            servedPath = previewPath
            contentType = 'image/jpeg'
          }
          response.statusCode = 200
          response.setHeader('Content-Type', contentType)
          response.setHeader('Cache-Control', 'no-store')
          createReadStream(servedPath).pipe(response)
          return
        }

        if (request.method === 'POST' && url.pathname === '/api/tag-local-images') {
          try {
            const body = await readJson(request)
            const allowedNames = new Set(listImages())
            const names = Array.isArray(body.names) ? body.names.filter((name: unknown) => typeof name === 'string' && allowedNames.has(name)) : []
            const threshold = Math.min(.95, Math.max(.1, Number(body.threshold) || .35))
            if (!names.length) {
              sendJson(response, 400, { error: '没有可打标的本地图片' })
              return
            }

            const fileArguments = names.flatMap((name: string) => ['--file', name])
            const child = spawn(pythonPath, [scriptPath, '--folder', imageFolder, ...fileArguments, '--threshold', String(threshold)], {
              cwd: projectRoot,
              windowsHide: true,
            })
            let stdout = ''
            let stderr = ''
            child.stdout.on('data', (chunk) => { stdout += chunk.toString('utf8') })
            child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8') })
            child.on('error', (error) => sendJson(response, 500, { error: error.message }))
            child.on('close', (code) => {
              if (response.writableEnded) return
              if (code !== 0) {
                sendJson(response, 500, { error: stderr.trim() || `本地打标器退出，代码 ${code}` })
                return
              }
              try {
                sendJson(response, 200, JSON.parse(stdout))
              } catch {
                sendJson(response, 500, { error: '本地打标器返回了无法解析的结果' })
              }
            })
          } catch (error) {
            sendJson(response, 500, { error: error instanceof Error ? error.message : '本地打标失败' })
          }
          return
        }

        next()
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, projectRoot, '')
  return { plugins: [localTaggerPlugin(env)] }
})
