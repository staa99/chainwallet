import { question } from '../util/cli_io'

export class Menu {
  title: string
  parent: Menu | undefined
  children: Menu[]
  action: () => Promise<void>
  isAction: boolean

  constructor(options: MenuOptions) {
    this.title = options.title
    this.parent = options.parent
    this.children = options.children || []
    this.action = !this.children.length && options.action ? options.action : this.enter.bind(this)

    this.isAction = this.children.length === 0
    for (const child of this.children) {
      child.parent = this
      child.children.push(
        new Menu({
          title: 'Back',
          parent: this,
          action: (): Promise<void> => this.enter(),
        })
      )
    }
  }

  async enter(): Promise<void> {
    if (this.isAction) {
      try {
        await this.action()
      } catch (e) {
        console.error(e)
      }

      if (this.parent) {
        await this.parent.enter()
      }
      return
    }

    this.print()
    const option = await this.promptOption()
    await option.enter()
  }

  async promptOption(): Promise<Menu> {
    try {
      const option = await question('Enter option: ')
      const mappedOption = Number(option) - 1
      if (!this.children[mappedOption]) {
        console.log('Invalid option')
        return await this.promptOption()
      }
      return this.children[mappedOption]
    } catch (e) {
      console.log('Invalid option')
      return await this.promptOption()
    }
  }

  print(): void {
    console.log()
    console.log(this.title)
    console.log('================')
    let i = 1
    for (const child of this.children) {
      console.log(`${i++}. ${child.title}`)
    }
  }
}

interface MenuOptions {
  title: string
  parent?: Menu
  children?: Menu[]
  action?: () => Promise<void>
}
