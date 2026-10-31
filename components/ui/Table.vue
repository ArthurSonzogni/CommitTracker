<script lang="ts">
// A table, with sorting, pagination, sticky header/column and detail rows.
// The columns come from the `columns` prop, or from <UiTableColumn> children,
// whose default slot renders the cells.
import { Fragment, defineComponent, h, ref, computed, watch, type PropType, type VNode } from 'vue'
import UiTableColumn from './TableColumn.vue'
import UiIcon from './Icon.vue'
import UiTooltip from './Tooltip.vue'

export type Column = {
  field?: string;
  label?: string;
  sortable?: boolean;
  sticky?: boolean;
  numeric?: boolean;
  visible?: boolean;
  tdAttrs?: (row: any, column: Column) => Record<string, any>;
  formatter?: (value: any, row: any) => any;
  cellClass?: string;
  headerClass?: string;
  // Explains the column, in a tooltip over its label.
  hint?: string;
  // From <UiTableColumn>: renders a cell.
  cell?: (props: { row: any, index: number, column: Column }) => VNode[];
};

const camelCase = (name: string) => name.replace(/-(\w)/g, (_, c) => c.toUpperCase());

// The <UiTableColumn> children, with their props and slot.
const slotColumns = (nodes: VNode[] = []): Column[] => nodes.flatMap(node => {
  if (node.type === Fragment) {
    return slotColumns(node.children as VNode[]);
  }
  if (node.type !== UiTableColumn) {
    return [];
  }
  const props = Object.fromEntries(Object.entries(node.props ?? {})
    .map(([key, value]) => [camelCase(key), value === '' ? true : value]));
  const slots = node.children as Record<string, any> | null;
  return [{ ...props, cell: slots?.default }];
});

export default defineComponent({
  name: 'UiTable',
  props: {
    data: { type: Array as PropType<any[]>, default: () => [] },
    columns: { type: Array as PropType<Column[]>, default: () => [] },
    rowKey: { type: [String, Function] as PropType<string | ((row: any) => string | number)>, default: undefined },
    striped: Boolean,
    hoverable: Boolean,
    bordered: Boolean,
    scrollable: Boolean,
    stickyHeader: Boolean,
    height: [String, Number],
    paginated: Boolean,
    perPage: { type: Number, default: 20 },
    detailed: Boolean,
  },
  setup(props, { slots }) {
    const sortField = ref<string | null>(null);
    const sortAscending = ref(true);
    const page = ref(1);
    const openedDetails = ref(new Set<any>());

    watch(() => props.data, () => {
      page.value = 1;
      openedDetails.value = new Set();
    });

    const getRowKey = (row: any, index: number): string | number => {
      if (typeof props.rowKey === 'function') {
        return props.rowKey(row);
      }
      if (typeof props.rowKey === 'string' && row != null && row[props.rowKey] !== undefined) {
        return row[props.rowKey];
      }
      return index;
    };

    const sorted = computed(() => {
      if (!sortField.value) {
        return props.data;
      }
      const field = sortField.value;
      const direction = sortAscending.value ? 1 : -1;
      return [...props.data].sort((a, b) => {
        const x = a[field];
        const y = b[field];
        if (x === y) return 0;
        if (x === undefined || x === null) return 1;
        if (y === undefined || y === null) return -1;
        if (typeof x === 'number' && typeof y === 'number') return (x - y) * direction;
        return String(x).localeCompare(String(y)) * direction;
      });
    });

    const pageCount = computed(() =>
      props.paginated ? Math.max(1, Math.ceil(sorted.value.length / props.perPage)) : 1);

    const rows = computed(() => props.paginated
      ? sorted.value.slice((page.value - 1) * props.perPage, page.value * props.perPage)
      : sorted.value);

    const sortBy = (column: Column) => {
      if (!column.sortable || !column.field) {
        return;
      }
      if (sortField.value === column.field) {
        sortAscending.value = !sortAscending.value;
      } else {
        sortField.value = column.field;
        sortAscending.value = true;
      }
    };

    const toggleDetail = (row: any) => {
      const opened = new Set(openedDetails.value);
      opened.has(row) ? opened.delete(row) : opened.add(row);
      openedDetails.value = opened;
    };

    const pagination = () => h('nav', { class: 'ui-table-pagination', 'aria-label': 'Pagination' }, [
      h('button', {
        type: 'button',
        class: 'button is-small',
        disabled: page.value <= 1,
        'aria-label': 'Previous page',
        onClick: () => page.value--,
      }, [h(UiIcon, { name: 'chevron-left', size: 'small' })]),
      h('span', { class: 'ui-table-page' }, `${page.value} / ${pageCount.value}`),
      h('button', {
        type: 'button',
        class: 'button is-small',
        disabled: page.value >= pageCount.value,
        'aria-label': 'Next page',
        onClick: () => page.value++,
      }, [h(UiIcon, { name: 'chevron-right', size: 'small' })]),
    ]);

    return () => {
      const columns = (props.columns.length ? props.columns : slotColumns(slots.default?.()))
        .filter(column => column.visible !== false);

      const header = h('thead', [h('tr', [
        props.detailed ? h('th', { class: 'ui-table-detail-toggle', 'aria-label': 'Details' }) : null,
        ...columns.map(column => h('th', {
          class: [column.headerClass, {
            'is-sortable': column.sortable,
            'is-sticky': column.sticky,
            'is-current-sort': sortField.value === column.field,
            'has-text-right': column.numeric,
          }],
          'aria-sort': sortField.value === column.field
            ? (sortAscending.value ? 'ascending' : 'descending')
            : undefined,
          onClick: () => sortBy(column),
        }, [
          h('span', { class: 'th-wrap' }, [
            column.hint
              ? h(UiTooltip, { text: column.hint, multiline: true, dashed: true, position: 'bottom' },
                () => column.label)
              : column.label,
            sortField.value === column.field
              ? h(UiIcon, { name: sortAscending.value ? 'arrow-up' : 'arrow-down', size: 'small' })
              : null,
          ]),
        ])),
      ])]);

      const body = h('tbody', rows.value.flatMap((row, index) => {
        const opened = openedDetails.value.has(row);
        const key = getRowKey(row, index);
        const cells = columns.map(column => {
          const extraAttrs = column.tdAttrs?.(row, column) ?? {};
          const rawValue = column.field ? row[column.field] : undefined;
          const content = column.cell
            ? column.cell({ row, index, column })
            : column.formatter
              ? String(column.formatter(rawValue, row) ?? '')
              : String(rawValue ?? '');
          return h('td', {
            ...extraAttrs,
            class: [column.cellClass, extraAttrs.class, {
              'is-sticky': column.sticky,
              'has-text-right': column.numeric,
            }],
            'data-label': column.label,
          }, content);
        });
        const tr = h('tr', { key, class: { 'is-detail-open': opened } }, [
          props.detailed
            ? h('td', { class: 'ui-table-detail-toggle' }, [h('button', {
                type: 'button',
                class: 'button is-small is-text',
                'aria-label': opened ? 'Hide details' : 'Show details',
                'aria-expanded': opened,
                onClick: () => toggleDetail(row),
              }, [h(UiIcon, { name: opened ? 'chevron-down' : 'chevron-right', size: 'small' })])])
            : null,
          ...cells,
        ]);
        if (!opened || !slots.detail) {
          return [tr];
        }
        return [tr, h('tr', { key: `${key}-detail`, class: 'detail' }, [
          h('td', { colspan: columns.length + 1 }, slots.detail({ row, index })),
        ])];
      }));

      const table = h('table', {
        class: ['table', 'is-fullwidth', {
          'is-striped': props.striped,
          'is-hoverable': props.hoverable,
          'is-bordered': props.bordered,
        }],
      }, [header, body]);

      const height = typeof props.height === 'number' ? `${props.height}px` : props.height;
      return h('div', { class: 'ui-table' }, [
        props.paginated ? pagination() : null,
        h('div', {
          class: ['table-wrapper', {
            'has-sticky-header': props.stickyHeader,
            'table-container': props.scrollable || props.stickyHeader,
          }],
          style: props.stickyHeader && height ? { height, overflowY: 'auto' } : undefined,
        }, [table]),
      ]);
    };
  },
});
</script>

<style scoped>
.ui-table-pagination {
  align-items: center;
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
  margin-bottom: 0.75rem;
}

.ui-table-page {
  color: var(--muted);
  font-size: 0.85rem;
  font-variant-numeric: tabular-nums;
}

.table-wrapper {
  overflow-x: auto;
}

.has-sticky-header :deep(thead th) {
  background: var(--surface);
  position: sticky;
  top: 0;
  z-index: 2;
}

:deep(.is-sticky) {
  background: var(--surface);
  left: 0;
  position: sticky;
  z-index: 1;
}

.has-sticky-header :deep(thead th.is-sticky) {
  z-index: 3;
}

:deep(th.is-sortable) {
  cursor: pointer;
  user-select: none;
}

:deep(th .th-wrap) {
  align-items: center;
  display: inline-flex;
  gap: 0.2rem;
}

:deep(.ui-table-detail-toggle) {
  width: 2.5rem;
}

:deep(tr.detail td) {
  background: var(--surface-sunken);
  padding: 1rem 1.25rem;
}
</style>
