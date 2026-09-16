import Discover from '@app/components/Discover';
import { useUser } from '@app/hooks/useUser';
import type { NextPage } from 'next';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';

// The start page only applies when the app is opened, not when the user
// taps Discover later. Client module state survives client-side navigation
// but resets on a full load, which is exactly "once per app open".
let startPageApplied = false;

const Index: NextPage = () => {
  const router = useRouter();
  const { user } = useUser();
  const startPage = user?.settings?.startPage;
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    if (!user || startPageApplied) {
      return;
    }
    startPageApplied = true;
    if (startPage && startPage !== '/') {
      setRedirecting(true);
      router.replace(startPage);
    }
  }, [startPage, router, user]);

  if (redirecting) {
    return null;
  }

  return <Discover />;
};

export default Index;
