import makeFunctionalModifier from 'ember-functional-modifiers';

function subscribe(logux, _, [type], options) {
  const channel = options.id ? `orbit/record/${type}/${options.id}` : `orbit/records/${type}`;
  logux.subscribe([channel]);
  return () => logux.unsubscribe([channel]);;
}

export default makeFunctionalModifier(
  { services: ['logux'] },
  subscribe
);
