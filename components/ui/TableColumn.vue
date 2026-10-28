<script lang="ts">
// A column of <UiTable>. Renders nothing: <UiTable> reads its props, and its
// default slot to render the cells (with `row` and `index`).
import { defineComponent } from 'vue'

export default defineComponent({
  name: 'UiTableColumn',
  props: {
    field: String,
    label: String,
    sortable: Boolean,
    sticky: Boolean,
    numeric: Boolean,
    visible: { type: Boolean, default: true },
    // (row, column) => attributes of the cell.
    tdAttrs: Function,
    cellClass: String,
    headerClass: String,
    // Explains the column, in a tooltip over its label.
    hint: String,
  },
  render: () => null,
});
</script>
