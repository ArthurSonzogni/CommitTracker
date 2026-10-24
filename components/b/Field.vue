<script lang="ts">
// A form field: an optional label, and controls. Compatible with Buefy's
// <b-field>, producing the same Bulma markup:
// - Several children are grouped as addons (.has-addons), or side by side
//   with `grouped` (.is-grouped), inside .field-body > .field.
// - `horizontal` puts the label on the side (.field-label / .field-body).
// - `label-position="on-border"` floats the label on the input border.
import { Comment, Fragment, Text, defineComponent, h, type VNode } from 'vue'

// The rendered children, without comments, text and fragments.
const elements = (nodes: VNode[] = []): VNode[] => nodes.flatMap(node => {
  if (node.type === Fragment) {
    return elements(node.children as VNode[]);
  }
  if (node.type === Comment || node.type === Text) {
    return [];
  }
  return [node];
});

const BField = defineComponent({
  name: 'BField',
  props: {
    label: String,
    grouped: Boolean,
    groupMultiline: Boolean,
    expanded: Boolean,
    horizontal: Boolean,
    // is-centered, is-right: alignment of the grouped or addons controls.
    position: String,
    addons: { type: Boolean, default: true },
    // on-border, inside.
    labelPosition: String,
  },
  setup(props, { slots }) {
    return () => {
      const children = slots.default?.() ?? [];
      const hasLabel = !!(props.label || slots.label);
      const hasAddons = props.addons && !props.horizontal && elements(children).length > 1;
      const hasInnerField = props.grouped || props.groupMultiline || hasAddons;

      const label = hasLabel
        ? h('label', { class: 'label' }, slots.label ? slots.label() : props.label)
        : null;

      const rootClass = ['field', {
        'is-expanded': props.expanded,
        'is-horizontal': props.horizontal,
        'is-floating-label': hasLabel && !props.horizontal && props.labelPosition === 'on-border',
        'is-floating-in-label': hasLabel && !props.horizontal && props.labelPosition === 'inside',
      }];

      if (props.horizontal) {
        return h('div', { class: rootClass }, [
          h('div', { class: 'field-label is-normal' }, label ? [label] : []),
          h('div', { class: 'field-body' },
            elements(children).map(child => h(BField, null, () => child))),
        ]);
      }

      if (!hasInnerField) {
        return h('div', { class: rootClass }, [label, children]);
      }

      const prefix = props.grouped ? 'is-grouped-' : 'has-addons-';
      const innerClass = ['field', {
        'is-grouped': props.grouped,
        'has-addons': !props.grouped && hasAddons,
        'is-grouped-multiline': props.groupMultiline,
      }, props.position ? prefix + props.position.split('-')[1] : null];
      return h('div', { class: rootClass }, [
        label,
        h('div', { class: 'field-body' }, [h('div', { class: innerClass }, children)]),
      ]);
    };
  },
});

export default BField;
</script>
