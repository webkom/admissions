import { useMutation } from "react-query";
import { callApiFromQuery } from "../utils/callApi";

export const useDeleteApplicationMutation = () =>
  useMutation(() => {
    return callApiFromQuery("/application/mine/", {
      method: "DELETE",
    });
  });
