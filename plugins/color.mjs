import { color } from "d3-color";
import { scaleOrdinal } from "d3-scale";
import { schemeCategory10 } from "d3-scale-chromatic";

export default (context, inject) => {
  inject('color', scaleOrdinal(schemeCategory10));
}
