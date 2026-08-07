import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync('frontend/src/layouts/MainLayout.jsx', 'utf8');

test('workspace tabs are committed only after the destination route commits', () => {
  const navigationStart = source.indexOf('const handleNavigation = React.useCallback');
  const navigationEnd = source.indexOf('\n  useEffect(() => {', navigationStart);
  const navigation = source.slice(navigationStart, navigationEnd);

  assert.match(navigation, /const nextTab = \{ id: nextPathname, label, path: nextPath \}/);
  assert.match(
    navigation,
    /pendingTabOpenRef\.current = \{[\s\S]*pathname: nextPathname,[\s\S]*tab: nextTab,[\s\S]*openOptions,[\s\S]*\};[\s\S]*navigate\(nextPath\)/
  );

  const changedRouteBranch = navigation.slice(
    navigation.indexOf("if (nextPath && currentRoutePath !== nextPath)"),
    navigation.indexOf('} else {', navigation.indexOf("if (nextPath && currentRoutePath !== nextPath)"))
  );
  assert.doesNotMatch(changedRouteBranch, /openTab\(/);

  const commitEffect = source.slice(navigationEnd, source.indexOf('\n  useEffect(() => {', navigationEnd + 1));
  assert.match(commitEffect, /pendingNavigationPathRef\.current !== currentPath/);
  assert.match(commitEffect, /pendingTabOpen\?\.pathname === currentPath/);
  assert.match(commitEffect, /openTab\(pendingTabOpen\.tab, pendingTabOpen\.openOptions\)/);
});

test('failed navigation cleanup removes the uncommitted tab request', () => {
  const cleanupStart = source.indexOf('const schedulePendingNavigationCleanup');
  const cleanupEnd = source.indexOf('\n  const authState', cleanupStart);
  const cleanup = source.slice(cleanupStart, cleanupEnd);

  assert.match(cleanup, /browserPath !== sourcePath/);
  assert.match(cleanup, /pendingTabOpenRef\.current\?\.pathname === nextPathname/);
  assert.match(cleanup, /pendingTabOpenRef\.current = null/);
  assert.match(cleanup, /previous === nextPathname \? '' : previous/);
});
