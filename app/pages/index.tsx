import React from "react";
import Head from "next/head";
import Layout from "../components/Layout";
import CategoryDashboard from "../components/CategoryDashboard";

const Index: React.FC = () => {
  return (
    <Layout>
      <Head>
        <title>Nudlers</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <CategoryDashboard />
    </Layout>
  );
};

export default Index;
