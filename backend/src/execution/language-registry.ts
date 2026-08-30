import { ExecutionError } from './errors.js'

export interface LanguageDefinition {
  id: string
  aliases: string[]
  providerLanguage: string
  version: string
  filename: string
}

export class LanguageRegistry {
  private readonly aliases = new Map<string, LanguageDefinition>()

  constructor(definitions: LanguageDefinition[]) {
    for (const definition of definitions) {
      for (const alias of [definition.id, ...definition.aliases]) {
        this.aliases.set(alias.toLowerCase(), definition)
      }
    }
  }

  resolve(language: string): LanguageDefinition {
    const definition = this.aliases.get(language.trim().toLowerCase())
    if (!definition) throw new ExecutionError('UNSUPPORTED_LANGUAGE', 'Language is not supported for execution')
    return definition
  }
}

export interface InitialLanguageVersions {
  python: string
  java: string
  c: string
  cpp: string
  javascript: string
}

export function initialLanguageRegistry(versions: InitialLanguageVersions): LanguageRegistry {
  return new LanguageRegistry([
    { id: 'python', aliases: ['py', 'python3'], providerLanguage: 'python', version: versions.python, filename: 'main.py' },
    { id: 'java', aliases: [], providerLanguage: 'java', version: versions.java, filename: 'Main.java' },
    { id: 'c', aliases: [], providerLanguage: 'c', version: versions.c, filename: 'main.c' },
    { id: 'cpp', aliases: ['c++'], providerLanguage: 'c++', version: versions.cpp, filename: 'main.cpp' },
    { id: 'javascript', aliases: ['js', 'node'], providerLanguage: 'javascript', version: versions.javascript, filename: 'main.js' },
  ])
}
