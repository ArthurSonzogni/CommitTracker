<script lang="ts">
// A column of <b-table>. Renders nothing: <b-table> reads its props, and its
// default slot to render the cells (with `row` and `index`). Compatible with
// Buefy's <b-table-column>.
import { defineComponent } from 'vue'

export default defineComponent({
  name: 'BTableColumn',
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
    draggableColumn: Boolean,
  },
  render: () => null,
});
</script>
