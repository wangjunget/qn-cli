#!/usr/bin/env node
import { $ } from 'zx'
import { program } from 'commander'
import shell from 'shelljs'
import axios from 'axios'
import fs from 'fs'
import clipboardy from 'clipboardy'

// 检查是否安装taobaodev
const hasTaobaodevExists = () => {
  if (!shell.which('taobaodev')) {
    throw new Error('未全局安装taobaodev')
  }
}

// 检查变量文件是否存在
const hasEnvFile = () => {
  if (!fs.existsSync('env.js')) {
    throw new Error('变量文件不存在')
  }
}

// 检查配置文件是否存在
const hasConfigFile = () => {
  if (!fs.existsSync('qn-config.json')) {
    throw new Error('配置文件不存在')
  }
}

// 获取配置文件配置
const getConfig = () => {
  return JSON.parse(fs.readFileSync('qn-config.json'))
}

program
  .version(
    JSON.parse(fs.readFileSync('package.json')).version,
    '-v, --version',
    '版本号'
  )
  .usage('<command> [options]')

// 模拟器打开
program
  .command('sim')
  .description('模拟器打开')
  .action(async () => {
    hasTaobaodevExists()
    await $`taobaodev build --sim`
  })

// 生成预览版本
program
  .command('build-preview')
  .description('生成预览版')
  .action(async () => {
    hasTaobaodevExists()
    hasConfigFile()
    const { appId, projectName, webHook } = getConfig()

    let res = await $`taobaodev build-preview -a ${appId} --copy --disBrowser`
    if (res.stderr) {
      await $`taobaodev login`
      await $`taobaodev build-preview -a ${appId} --copy --disBrowser`
    }

    const clip = clipboardy.readSync()

    const data = {
      text: {
        content: `[小程序-${projectName}]： ${clip}`,
      },
      msgtype: 'text',
    }

    if (webHook && webHook.url) {
	axios.post(webHook.url, data)
    }

  })

// 上传版本，生成pre-release
program
  .command('pre-release')
  .description('上传文件，生成pre-release')
  .action(async () => {
    hasConfigFile()
    hasEnvFile()
    // 检查所在分支
    const gitBranchRaw = await $`git branch --show-current`
    const branch = gitBranchRaw.stdout.split('\n')[0]
    if (branch !== 'develop') {
      throw new Error('必须在develop分支上操作')
    }

    // 检查工作区是否干净
    const gitStatus = await $`git status -s`
    if (gitStatus.stdout) {
      throw new Error('必须保持工作区干净')
    }


    // 切换到pre-release 分支
    await $`git checkout pre-release`

    // 指定版本号
    const env =  JSON.parse(fs.readFileSync('env.json', { encoding: 'utf-8' }))
    const newVersion = await question(`输入版本号(上次版本号: ${env.version})`)

    // 合并develop分支
    await $`git merge develop -X theirs`

    // 修改配置文件
    try {
      await fs.writeFile(
        'env.json',
        `{\n\t"cloudEnv": "online",\n\t"version": ${newVersion}\n}`
      )
    } catch (e) {
      console.log(e)
    }

    await $`git add .`
    await $`git commit -a -m "pre-release ${newVersion}"`

    // 上传到淘宝开放平台
    const uploadResult =
      await $`taobaodev upload -a ${config.appId} -v ${newVersion}`
    if (uploadResult.stderr) {
      // 版本错误回退
      await $`git reset --soft HEAD^`
    }
  })

program.parse(process.argv)
