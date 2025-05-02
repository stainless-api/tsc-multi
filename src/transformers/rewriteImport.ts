import { resolve, dirname, extname, relative } from "path";
import type ts from "typescript";
import { trimSuffix } from "../utils";
import assert from "assert";
import {
  isExternalModuleReference,
  isImportEqualsDeclaration,
} from "typescript";

const JS_EXT = ".js";
const JSON_EXT = ".json";

function isRelativePath(path: string): boolean {
  return path.startsWith("./") || path.startsWith("../");
}

export interface RewriteImportTransformerOptions {
  extname: string;
  getResolvedShareHelpers(): string | undefined;
  helpersNeeded: Set<string>;
  system: ts.System;
  ts: typeof ts;
}

function positionIsSynthesized(pos: number): boolean {
  // This is a fast way of testing the following conditions:
  //  pos === undefined || pos === null || isNaN(pos) || pos < 0;
  return !(pos >= 0);
}

function nodeIsSynthesized(range: ts.TextRange): boolean {
  return positionIsSynthesized(range.pos) || positionIsSynthesized(range.end);
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
    isVariableStatement,
    isSourceFile,
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

  const tslibRequires = new WeakSet<ts.Node>();

  return (ctx) => {
    const resolvedShareHelpers = options.getResolvedShareHelpers();
    let sourceFile: ts.SourceFile;

    function getRelativeImport(mod: string) {
      const r = relative(dirname(sourceFile.fileName), mod);
      return /^\.?\.?\//.test(r) ? r : "./" + r;
    }

    const visitor: ts.Visitor = (node) => {
      if (resolvedShareHelpers && isSourceFile(node)) {
        for (const helper of ((node as any).emitNode?.helpers as any[]) ?? []) {
          if (!helper.scoped) {
            options.helpersNeeded.add(helper.importName);
          }
        }
      }

      if (resolvedShareHelpers) {
        if (
          isImportDeclaration(node) &&
          nodeIsSynthesized(node) &&
          isStringLiteral(node.moduleSpecifier) &&
          node.moduleSpecifier.text === "tslib"
        ) {
          return factory.createImportDeclaration(
            node.modifiers,
            node.importClause,
            factory.createStringLiteral(
              getRelativeImport(resolvedShareHelpers)
            ),
            node.attributes
          );
        }
        if (isVariableStatement(node)) {
          const requireCall = node.declarationList.declarations[0]?.initializer;
          let original: ts.Node;
          if (
            requireCall &&
            isCallExpression(requireCall) &&
            isIdentifier(requireCall.expression) &&
            requireCall.expression.escapedText === "require" &&
            "original" in node &&
            typeof node.original === "object" &&
            node.original !== null &&
            ((original = node.original as ts.Node),
            nodeIsSynthesized(original)) &&
            (isImportDeclaration(original)
              ? isStringLiteral(original.moduleSpecifier) &&
                original.moduleSpecifier.text === "tslib"
              : isImportEqualsDeclaration(original) &&
                isExternalModuleReference(original.moduleReference) &&
                isStringLiteral(original.moduleReference.expression) &&
                original.moduleReference.expression.text === "tslib")
          ) {
            tslibRequires.add(requireCall);
          }
        }
      }
      // ESM import
      if (isImportDeclaration(node)) {
        return factory.createImportDeclaration(
          node.modifiers,
          node.importClause,
          updateModuleSpecifier(ctx, sourceFile, node.moduleSpecifier),
          node.attributes
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
          node.attributes
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
          [
            resolvedShareHelpers && tslibRequires.has(node)
              ? factory.createStringLiteral(
                  getRelativeImport(resolvedShareHelpers)
                )
              : updateModuleSpecifier(ctx, sourceFile, firstArg),
            ...restArgs,
          ]
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
