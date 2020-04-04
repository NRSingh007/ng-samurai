import * as fs from 'fs';
import * as ts from 'typescript';
import { Tree } from '@angular-devkit/schematics';
import { findModule } from '@schematics/angular/utility/find-module';
import { convertToAbsolutPath, getFolderPath } from '../shared/pathHelper';

interface Modification {
  startPosition: number;
  endPosition: number;
  content: string;
}

export function updateImportPaths(tree: Tree, filePath: string): string {
  const sourceCode = fs.readFileSync(filePath, 'utf-8');
  const sourceFile = ts.createSourceFile(filePath, sourceCode, ts.ScriptTarget.Latest, true);
  const modifications = modify(sourceFile, filePath, tree);

  if(modifications.length === 0){
    return;
  }
  const modifiedSource = applyReplacements(sourceCode, modifications);
  tree.overwrite(filePath, modifiedSource);
}

function modify(node: ts.Node, filePath: string, tree: Tree): Modification[] {
  const modifications: Modification[] = [];
  const moduleOfFile = findModule(tree, getFolderPath(filePath));

  function updatePaths(node: ts.Node) {
    if (ts.isImportDeclaration(node)) {
      const importSegments = node.getChildren();
      const importNode = importSegments.find(
        segment => segment.kind === ts.SyntaxKind.StringLiteral
      );

      if (
        importNode &&
        !isThirdPartyLibImport(importNode) &&
        importsForeignModuleCode(importNode, moduleOfFile, filePath, tree)
      ) {
        const moduleFromImportPath = getModulePathFromImport(importNode.getText(), filePath, tree);
        modifications.push({
          startPosition: importNode.pos + 1,
          endPosition: importNode.end + 1,
          content: `'${convertModulePathToPublicAPIImport(moduleFromImportPath)}';`
        });
      }
    }
  }

  node.forEachChild(updatePaths);
  return modifications;
}

function isThirdPartyLibImport(importNode: ts.Node): boolean {
  return !importNode.getText().startsWith(`'.`);
}

function importsForeignModuleCode(
  importNode: ts.Node,
  fileModulePath: string,
  filePath: string,
  tree: Tree
): boolean {
  const importStringLiteral = importNode.getText();
  return fileModulePath !== getModulePathFromImport(importStringLiteral, filePath, tree);
}

function getModulePathFromImport(importLiteral: string, filePath: string, tree: Tree): string {
  return findModule(tree, convertToAbsolutPath(filePath, importLiteral));
}

const convertModulePathToPublicAPIImport = (modulePath: string): string => {
  const regex = /\/projects\/(.*)(\/)/;
  const pathSegments = regex.exec(modulePath);
  return pathSegments && pathSegments.length ? pathSegments[1] : '';
};

function applyReplacements(source: string, modifications: Modification[]): string {
  for (const modification of modifications.reverse()) {
    source =
      source.slice(0, modification.startPosition) +
      modification.content +
      source.slice(modification.endPosition);
  }
  return source;
}
