import React from "react";
import Head from "next/head";
import Layout from "../components/Layout";
import Homepage from "../components/Homepage";

const Index: React.FC = () => {
  return (
    <Layout>
      <Head>
        <title>Nudlers - Financial Overview</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <Homepage />
    </Layout>
  );
};

export default Index;
