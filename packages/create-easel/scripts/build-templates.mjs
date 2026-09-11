import {mkdirSync, readFileSync, readdirSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';

const root = fileURLToPath(new URL('../', import.meta.url));

function copyTemplates(source, destination, language) {
  for (const entry of readdirSync(source, {withFileTypes: true})) {
    const input = join(source, entry.name);
    let output = join(destination, entry.name);
    if (entry.isDirectory()) {
      copyTemplates(input, output, language);
      continue;
    }
    if (!entry.isFile()) throw new Error(`Unsupported template entry: ${input}`);
    let content = readFileSync(input, 'utf8');
    if (language === 'js' && /\.tsx?$/.test(input)) {
      output = output.replace(/\.tsx?$/, input.endsWith('.tsx') ? '.jsx' : '.js');
      content = ts.transpileModule(content, {
        fileName: input,
        compilerOptions: {
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.ESNext,
          jsx: ts.JsxEmit.Preserve,
        },
      }).outputText;
    } else if (language === 'js' && input.endsWith('.vue')) {
      content = content.replace('<script setup lang="ts">', '<script setup>');
    }
    mkdirSync(dirname(output), {recursive: true});
    writeFileSync(output, content);
  }
}

for (const language of ['ts', 'js']) {
  copyTemplates(
    join(root, 'templates'),
    join(root, 'dist/templates', language),
    language,
  );
}
