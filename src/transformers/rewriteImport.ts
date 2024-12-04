import { resolve, dirname, extname } from "path";
import type ts from "typescript";
import { trimSuffix } from "../utils";
import assert from "assert";

const JS_EXT = ".js";
const JSON_EXT = ".json";

function isRelativePath(path: string): boolean {
  return path.startsWith("./") || path.startsWith("../");
}

export interface RewriteImportTransformerOptions {
  extname: string;
  system: ts.System;
  ts: typeof ts;
}

export function createRewriteImportTransformer<
  T extends ts.SourceFile | ts.Bundle
>(options: RewriteImportTransformerOptions): ts.TransformerFactory<T> {
  const {
    sys,
    factory,
    isStringLiteral,
    isImportDeclaration,
    isCallExpression,
    SyntaxKind,
    visitNode,
    visitEachChild,
    isIdentifier,
    isExportDeclaration,
  } = options.ts;

  function isDirectory(sourceFile: ts.SourceFile, path: string): boolean {
    const sourcePath = sourceFile.fileName;
    const fullPath = resolve(dirname(sourcePath), path);

    return sys.directoryExists(fullPath);
  }

  function fileExists(sourceFile: ts.SourceFile, path: string): boolean {
    const sourcePath = sourceFile.fileName;
    const fullPath = resolve(dirname(sourcePath), path);

    return sys.fileExists(fullPath);
  }

  function updateModuleSpecifier(
    ctx: ts.TransformationContext,
    sourceFile: ts.SourceFile,
    node: ts.Expression
  ): ts.Expression {
    if (!isStringLiteral(node) || !isRelativePath(node.text)) return node;

    const ext = extname(node.text);

    if (ext === JSON_EXT && ctx.getCompilerOptions().resolveJsonModule) {
      return node;
    }

    const base = ext === JS_EXT ? trimSuffix(node.text, JS_EXT) : node.text;

    if (
      !(
        fileExists(sourceFile, `${base}.ts`) ||
        fileExists(sourceFile, `${base}.js`)
      ) &&
      isDirectory(sourceFile, node.text)
    ) {
      return factory.createStringLiteral(
        `${node.text}/index${options.extname}`
      );
    }

    return factory.createStringLiteral(`${base}${options.extname}`);
  }

  return (ctx) => {
    let sourceFile: ts.SourceFile;

    const visitor: ts.Visitor = (node) => {
      // ESM import
      if (isImportDeclaration(node)) {
        return factory.createImportDeclaration(
          node.modifiers,
          node.importClause,
          updateModuleSpecifier(ctx, sourceFile, node.moduleSpecifier),
          node.assertClause
        );
      }

      // ESM export
      if (isExportDeclaration(node)) {
        if (!node.moduleSpecifier) return node;

        return factory.createExportDeclaration(
          node.modifiers,
          node.isTypeOnly,
          node.exportClause,
          updateModuleSpecifier(ctx, sourceFile, node.moduleSpecifier),
          node.assertClause
        );
      }

      // ESM dynamic import
      if (
        isCallExpression(node) &&
        node.expression.kind === SyntaxKind.ImportKeyword
      ) {
        const [firstArg, ...restArg] = node.arguments;
        if (!firstArg) return node;

        return factory.createCallExpression(
          node.expression,
          node.typeArguments,
          [updateModuleSpecifier(ctx, sourceFile, firstArg), ...restArg]
        );
      }

      // CommonJS require
      if (
        isCallExpression(node) &&
        isIdentifier(node.expression) &&
        node.expression.escapedText === "require"
      ) {
        const [firstArg, ...restArgs] = node.arguments;
        if (!firstArg) return node;

        return factory.createCallExpression(
          node.expression,
          node.typeArguments,
          [updateModuleSpecifier(ctx, sourceFile, firstArg), ...restArgs]
        );
      }

      return visitEachChild(node, visitor, ctx);
    };

    return (file) => {
      if (options.ts.isSourceFile(file)) {
        sourceFile = file;
        return visitNode(file, visitor) as any;
      } else if (options.ts.isBundle(file)) {
        return ctx.factory.createBundle(
          file.sourceFiles.map((file) => {
            sourceFile = file;
            return visitNode(file, visitor) as ts.SourceFile;
          })
        ) as any;
      } else {
        assert(false);
      }
    };
  };
}
