import { useState, useEffect } from 'react';

export interface Customer {
  id: number;
  code: string;
  name: string;
  manager: string;
  phone: string;
  email: string;
  registeredAt: string;
}

export const useCustomers = () => {
  const [customers, setCustomers] = useState<Customer[]>([]);

  // Simulate API call to fetch customers
  const fetchCustomers = async () => {
    return new Promise<Customer[]>((resolve) => {
      setTimeout(() => {
        resolve([
          { id: 1, code: 'C001', name: '더산', manager: '김철수', phone: '010-1111-2222', email: 'kim@thesan.com', registeredAt: '2023-01-15' },
          { id: 2, code: 'C002', name: '나이키', manager: '이영희', phone: '010-3333-4444', email: 'lee@nike.com', registeredAt: '2023-02-20' },
          { id: 3, code: 'C003', name: '아디다스', manager: '박지성', phone: '010-5555-6666', email: 'park@adidas.com', registeredAt: '2023-03-10' },
          { id: 4, code: 'C004', name: '퓨마', manager: '최수영', phone: '010-7777-8888', email: 'choi@puma.com', registeredAt: '2023-04-05' },
          { id: 5, code: 'C005', name: '뉴발란스', manager: '정대만', phone: '010-9999-0000', email: 'jung@newbalance.com', registeredAt: '2023-05-12' },
        ]);
      }, 500); // Simulate network delay
    });
  };

  useEffect(() => {
    fetchCustomers().then(data => setCustomers(data));
  }, []);

  const addCustomer = (newCustomer: Omit<Customer, 'id' | 'registeredAt'>) => {
    const id = Math.max(...customers.map((c) => c.id), 0) + 1;
    const registeredAt = new Date().toISOString().split('T')[0]; // Current date
    setCustomers((prev) => [...prev, { ...newCustomer, id, registeredAt }]);
  };

  const updateCustomer = (updatedCustomer: Customer) => {
    setCustomers((prev) =>
      prev.map((c) => (c.id === updatedCustomer.id ? updatedCustomer : c))
    );
  };

  const deleteCustomer = (id: number) => {
    setCustomers((prev) => prev.filter((c) => c.id !== id));
  };

  return { customers, addCustomer, updateCustomer, deleteCustomer };
};
