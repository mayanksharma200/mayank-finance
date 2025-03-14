import { useState } from "react";
import { toast } from "sonner";

const useFetch = (cb) => {
  const [data, setData] = useState(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fn = async (...args) => {
    setLoading(true);
    setError(null);

    try {
      const response = await cb(...args);
      setData(response);
      setError(null);
      return response; // Return the response so it can be used in the caller
    } catch (error) {
      setError(error);
      toast.error(error.message);
      return { success: false, error: error.message }; // Return a consistent error object
    } finally {
      setLoading(false);
    }
  };

  return { data, loading, error, fn, setData };
};

export default useFetch;
